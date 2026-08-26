import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/event_model.dart';
import '../services/event_service.dart';

class TicketTemplateScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;

  const TicketTemplateScreen({
    super.key,
    required this.eventId,
    this.eventService,
  });

  @override
  State<TicketTemplateScreen> createState() => _TicketTemplateScreenState();
}

class _TicketTemplateScreenState extends State<TicketTemplateScreen> {
  late final EventService _eventService;
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();

  bool _isLoading = true;
  bool _isSavingTicket = false;
  bool _isSavingEmail = false;
  bool _customMode = false;
  bool _emailActive = false;
  String? _backgroundUrl;
  File? _localBackground;
  double _backgroundAspectRatio = 0.75;
  List<TicketTemplateElementModel> _elements = [];
  List<String> _ticketTokenOptions = [];
  List<String> _emailTokenOptions = [];
  TextEditingController? _activeEmailController;

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _activeEmailController = _bodyController;
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _eventService.getTicketTemplate(widget.eventId),
        _eventService.getApprovalEmailTemplate(widget.eventId),
      ]);
      final ticket = results[0] as TicketTemplateModel;
      final email = results[1] as ApprovalEmailTemplateModel;
      if (!mounted) return;
      setState(() {
        _customMode = ticket.mode == 'custom';
        _backgroundUrl = ticket.backgroundUrl;
        _elements = List.of(ticket.elements);
        _ticketTokenOptions = ticket.tokenOptions;
        _emailTokenOptions = email.tokenOptions;
        _emailActive = email.isActive;
        _subjectController.text = email.subject;
        _bodyController.text = email.body;
        _isLoading = false;
      });
      if (ticket.backgroundUrl != null) {
        final ratio = await _resolveNetworkAspectRatio(ticket.backgroundUrl!);
        if (ratio != null && mounted) {
          setState(() => _backgroundAspectRatio = ratio);
        }
      }
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
      if (mounted) setState(() => _isLoading = false);
    } catch (_) {
      _showMessage('Konfigurasi tiket belum dapat dimuat.');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<double?> _resolveNetworkAspectRatio(String url) async {
    final stream = NetworkImage(url).resolve(const ImageConfiguration());
    final completer = Completer<double?>();
    late ImageStreamListener listener;
    listener = ImageStreamListener(
      (info, _) {
        stream.removeListener(listener);
        completer.complete(info.image.width / info.image.height);
      },
      onError: (Object error, StackTrace? stackTrace) {
        stream.removeListener(listener);
        completer.complete(null);
      },
    );
    stream.addListener(listener);
    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        stream.removeListener(listener);
        return null;
      },
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  List<TicketTemplateElementModel> _requiredElements() => const [
    TicketTemplateElementModel(
      type: 'qr',
      x: 0.35,
      y: 0.18,
      width: 0.30,
      height: 0.30,
    ),
    TicketTemplateElementModel(
      type: 'ticket_code',
      x: 0.15,
      y: 0.62,
      width: 0.70,
      height: 0.10,
    ),
  ];

  void _enableCustomMode(bool enabled) {
    setState(() {
      _customMode = enabled;
      if (enabled && _elements.isEmpty) _elements = _requiredElements();
    });
  }

  Future<void> _pickBackground() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    final file = File(picked.path);

    try {
      final url = await _eventService.uploadTicketTemplateBackground(
        widget.eventId,
        file.path,
      );
      final bytes = await file.readAsBytes();
      final image = await decodeImageFromList(bytes);
      if (!mounted) return;
      setState(() {
        _localBackground = file;
        _backgroundUrl = url;
        _backgroundAspectRatio = image.width / image.height;
      });
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage('Gambar template belum dapat diunggah. Silakan coba lagi.');
    }
  }

  void _moveElement(int index, DragUpdateDetails details, Size canvasSize) {
    final current = _elements[index];
    final x = (current.x + details.delta.dx / canvasSize.width)
        .clamp(0.0, 1.0 - current.width)
        .toDouble();
    final y = (current.y + details.delta.dy / canvasSize.height)
        .clamp(0.0, 1.0 - current.height)
        .toDouble();
    setState(() => _elements[index] = current.copyWith(x: x, y: y));
  }

  String _elementLabel(TicketTemplateElementModel element) {
    switch (element.type) {
      case 'qr':
        return 'QR Code';
      case 'ticket_code':
        return 'Kode Tiket';
      case 'name':
        return 'Nama';
      case 'email':
        return 'Email';
      case 'event_name':
        return 'Nama Event';
      case 'field':
        return element.token ?? 'Data Peserta';
      default:
        return 'Data';
    }
  }

  void _addOptionalElement(String token) {
    final type = switch (token) {
      'NAME' => 'name',
      'EMAIL' => 'email',
      'EVENT_NAME' => 'event_name',
      _ => token == 'CODE' ? 'ticket_code' : 'field',
    };
    final exists = type == 'field'
        ? _elements.any(
            (element) => element.type == 'field' && element.token == token,
          )
        : _elements.any((element) => element.type == type);
    if (type == 'ticket_code' || exists) {
      return;
    }
    setState(() {
      _elements = [
        ..._elements,
        TicketTemplateElementModel(
          type: type,
          token: type == 'field' ? token : null,
          x: 0.12,
          y: 0.76,
          width: 0.65,
          height: 0.07,
        ),
      ];
    });
  }

  void _removeOptionalElement(int index) {
    if (_elements[index].type == 'qr' ||
        _elements[index].type == 'ticket_code') {
      return;
    }
    setState(() => _elements.removeAt(index));
  }

  Future<void> _saveTicketTemplate() async {
    if (_customMode && _backgroundUrl == null) {
      _showMessage('Unggah gambar latar sebelum mengaktifkan template kustom.');
      return;
    }
    setState(() => _isSavingTicket = true);
    try {
      await _eventService.saveTicketTemplate(
        widget.eventId,
        mode: _customMode ? 'custom' : 'default',
        elements: _customMode ? _elements : const [],
      );
      _showMessage('Template tiket berhasil disimpan.');
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage('Template tiket belum dapat disimpan. Silakan coba lagi.');
    } finally {
      if (mounted) setState(() => _isSavingTicket = false);
    }
  }

  void _insertEmailToken(String token) {
    final controller = _activeEmailController ?? _bodyController;
    final selection = controller.selection.isValid
        ? controller.selection
        : TextSelection.collapsed(offset: controller.text.length);
    final start = selection.start;
    final end = selection.end;
    final updated = controller.text.replaceRange(start, end, '[$token]');
    controller.value = TextEditingValue(
      text: updated,
      selection: TextSelection.collapsed(offset: start + token.length + 2),
    );
  }

  Future<void> _saveEmailTemplate() async {
    setState(() => _isSavingEmail = true);
    try {
      await _eventService.saveApprovalEmailTemplate(
        widget.eventId,
        isActive: _emailActive,
        subject: _subjectController.text,
        body: _bodyController.text,
      );
      _showMessage('Template email berhasil disimpan.');
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage('Template email belum dapat disimpan. Silakan coba lagi.');
    } finally {
      if (mounted) setState(() => _isSavingEmail = false);
    }
  }

  Widget _buildTemplatePreview() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = width / _backgroundAspectRatio;
        return SizedBox(
          width: width,
          height: height,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xFFF3F3F3),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFBDBDBD)),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (_localBackground != null)
                    Image.file(_localBackground!, fit: BoxFit.fill)
                  else if (_backgroundUrl != null)
                    Image.network(_backgroundUrl!, fit: BoxFit.fill)
                  else
                    const Center(
                      child: Text('Unggah gambar latar untuk melihat preview'),
                    ),
                  if (_backgroundUrl != null || _localBackground != null)
                    ..._elements.asMap().entries.map((entry) {
                      final index = entry.key;
                      final element = entry.value;
                      return Positioned(
                        left: element.x * width,
                        top: element.y * height,
                        width: element.width * width,
                        height: element.height * height,
                        child: GestureDetector(
                          onPanUpdate: (details) =>
                              _moveElement(index, details, Size(width, height)),
                          onLongPress: () => _removeOptionalElement(index),
                          child: Container(
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: element.type == 'qr'
                                  ? Colors.white.withValues(alpha: 0.92)
                                  : Colors.black.withValues(alpha: 0.82),
                              border: Border.all(
                                color: const Color(0xFFFFFFFF),
                                width: 2,
                              ),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: element.type == 'qr'
                                ? const Icon(
                                    Icons.qr_code_2,
                                    color: Colors.black,
                                  )
                                : Text(
                                    _elementLabel(element),
                                    textAlign: TextAlign.center,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 11,
                                    ),
                                  ),
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFBDBDBD)),
      ),
      child: Material(
        color: Colors.transparent,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Colors.black)),
      );
    }
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        title: const Text('Template Tiket & Email'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
      ),
      body: ListView(
        key: const ValueKey('ticket-template-scroll'),
        padding: const EdgeInsets.all(16),
        children: [
          _sectionCard(
            title: 'Template Tiket',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Gunakan template kustom'),
                  subtitle: const Text(
                    'Template bawaan tetap dipakai bila opsi ini nonaktif.',
                  ),
                  value: _customMode,
                  activeThumbColor: Colors.black,
                  onChanged: _enableCustomMode,
                ),
                if (_customMode) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _pickBackground,
                    icon: const Icon(Icons.upload_file),
                    label: Text(
                      _backgroundUrl == null
                          ? 'Unggah Gambar Latar'
                          : 'Ganti Gambar Latar',
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'JPG, PNG, atau WebP maksimal 5 MB. Geser blok QR dan kode tiket ke posisi yang diinginkan.',
                  ),
                  const SizedBox(height: 12),
                  _buildTemplatePreview(),
                  const SizedBox(height: 12),
                  const Text('Tambah data peserta opsional'),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _ticketTokenOptions
                        .where((token) => token != 'CODE')
                        .map(
                          (token) => ActionChip(
                            label: Text(token),
                            onPressed: () => _addOptionalElement(token),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Tekan lama blok data opsional untuk menghapusnya.',
                    style: TextStyle(fontSize: 12),
                  ),
                ],
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSavingTicket ? null : _saveTicketTemplate,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      _isSavingTicket
                          ? 'Menyimpan...'
                          : 'Simpan Template Tiket',
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _sectionCard(
            title: 'Email Persetujuan Manual Review',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Aktifkan email kustom'),
                  subtitle: const Text(
                    'Hanya dikirim saat pendaftar Manual Review diterima. OTP tidak berubah.',
                  ),
                  value: _emailActive,
                  activeThumbColor: Colors.black,
                  onChanged: (value) => setState(() => _emailActive = value),
                ),
                TextField(
                  controller: _subjectController,
                  onTap: () => _activeEmailController = _subjectController,
                  decoration: const InputDecoration(
                    labelText: 'Subjek email',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _bodyController,
                  onTap: () => _activeEmailController = _bodyController,
                  minLines: 6,
                  maxLines: 10,
                  decoration: const InputDecoration(
                    labelText: 'Isi email',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Pilih token untuk menyisipkan pada posisi kursor aktif:',
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _emailTokenOptions
                      .map(
                        (token) => OutlinedButton(
                          onPressed: () => _insertEmailToken(token),
                          child: Text('[$token]'),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSavingEmail ? null : _saveEmailTemplate,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      _isSavingEmail ? 'Menyimpan...' : 'Simpan Template Email',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }
}
