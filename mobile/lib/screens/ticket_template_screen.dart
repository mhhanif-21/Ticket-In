import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';

import '../models/event_model.dart';
import '../services/event_service.dart';

enum _PublicationDecision { publishNow, later }

class TicketTemplateScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;
  final bool isFirstSetup;

  const TicketTemplateScreen({
    super.key,
    required this.eventId,
    this.eventService,
    this.isFirstSetup = false,
  });

  @override
  State<TicketTemplateScreen> createState() => _TicketTemplateScreenState();
}

class _TicketTemplateScreenState extends State<TicketTemplateScreen> {
  static const _ticketPaletteTokens = <String>[
    'NAME',
    'EMAIL',
    'EVENT_NAME',
    'CODE',
  ];

  late final EventService _eventService;
  final _otpSubjectController = TextEditingController();
  final _otpBodyController = TextEditingController();
  final _ticketSubjectController = TextEditingController();
  final _ticketBodyController = TextEditingController();

  bool _isLoading = true;
  bool _isSavingTicket = false;
  bool _isPublishing = false;
  bool _isSavingOtpEmail = false;
  bool _isSavingTicketEmail = false;
  bool _customMode = false;
  bool _otpEmailActive = false;
  bool _ticketEmailActive = false;
  String _registrationMode = 'Manual Review';
  String? _backgroundUrl;
  File? _localBackground;
  double _backgroundAspectRatio = 0.75;
  List<TicketTemplateElementModel> _elements = [];
  List<String> _otpTokenOptions = const ['NAME', 'EMAIL', 'EVENT_NAME', 'CODE'];
  List<String> _ticketEmailTokenOptions = const [
    'NAME',
    'EMAIL',
    'EVENT_NAME',
    'TICKET_IMAGE',
  ];
  int? _selectedElementIndex;

  bool get _isManualReview => _registrationMode == 'Manual Review';

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _load();
  }

  Future<void> _load() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      final ticket = await _eventService.getTicketTemplate(widget.eventId);
      List<ApprovalEmailTemplateModel> emails = const [];
      if (event.registrationMode == 'Manual Review') {
        emails = await Future.wait([
          _eventService.getOtpEmailTemplate(widget.eventId),
          _eventService.getApprovalEmailTemplate(widget.eventId),
        ]);
      }

      if (!mounted) return;
      setState(() {
        _registrationMode = event.registrationMode;
        _customMode = ticket.mode == 'custom';
        _backgroundUrl = ticket.backgroundUrl;
        _elements = List.of(ticket.elements);
        _otpEmailActive = emails.isNotEmpty && emails[0].isActive;
        _ticketEmailActive = emails.length > 1 && emails[1].isActive;
        _otpTokenOptions =
            emails.isNotEmpty && emails[0].tokenOptions.isNotEmpty
            ? emails[0].tokenOptions
            : _otpTokenOptions;
        _ticketEmailTokenOptions =
            emails.length > 1 && emails[1].tokenOptions.isNotEmpty
            ? emails[1].tokenOptions
            : _ticketEmailTokenOptions;
        _otpSubjectController.text = emails.isNotEmpty ? emails[0].subject : '';
        _otpBodyController.text = emails.isNotEmpty ? emails[0].body : '';
        _ticketSubjectController.text = emails.length > 1
            ? emails[1].subject
            : '';
        _ticketBodyController.text = emails.length > 1 ? emails[1].body : '';
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
    if (!mounted) return;
    setState(() {
      _customMode = enabled;
      _selectedElementIndex = null;
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
    if (index < 0 || index >= _elements.length || !mounted) return;
    final current = _elements[index];
    final x = (current.x + details.delta.dx / canvasSize.width)
        .clamp(0.0, 1.0 - current.width)
        .toDouble();
    final y = (current.y + details.delta.dy / canvasSize.height)
        .clamp(0.0, 1.0 - current.height)
        .toDouble();
    setState(() {
      _selectedElementIndex = index;
      _elements[index] = current.copyWith(x: x, y: y);
    });
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

  String? _elementToken(TicketTemplateElementModel element) {
    switch (element.type) {
      case 'name':
        return 'NAME';
      case 'email':
        return 'EMAIL';
      case 'event_name':
        return 'EVENT_NAME';
      case 'ticket_code':
        return 'CODE';
      case 'field':
        return element.token;
      default:
        return null;
    }
  }

  List<String> get _availableTicketTokens {
    final usedTokens = _elements.map(_elementToken).whereType<String>().toSet();
    return _ticketPaletteTokens
        .where((token) => !usedTokens.contains(token))
        .toList();
  }

  void _addElement(String token) {
    if (!_ticketPaletteTokens.contains(token) ||
        _elements.any((element) => _elementToken(element) == token)) {
      return;
    }
    final type = switch (token) {
      'NAME' => 'name',
      'EMAIL' => 'email',
      'EVENT_NAME' => 'event_name',
      'CODE' => 'ticket_code',
      _ => 'field',
    };
    final y = (0.76 + (_elements.length * 0.06)).clamp(0.0, 0.88).toDouble();
    setState(() {
      _elements = [
        ..._elements,
        TicketTemplateElementModel(
          type: type,
          x: 0.12,
          y: y,
          width: 0.65,
          height: 0.07,
        ),
      ];
      _selectedElementIndex = _elements.length - 1;
    });
  }

  void _removeSelectedElement() {
    final index = _selectedElementIndex;
    if (index == null || index < 0 || index >= _elements.length) return;
    final element = _elements[index];
    if (element.type == 'qr' || element.type == 'ticket_code') {
      _showMessage('QR dan Kode Tiket wajib tersedia.');
      return;
    }
    setState(() {
      _elements = [..._elements]..removeAt(index);
      _selectedElementIndex = null;
    });
  }

  void _setSelectedFontScale(double fontScale) {
    final index = _selectedElementIndex;
    if (index == null || index < 0 || index >= _elements.length) return;
    setState(() {
      _elements[index] = _elements[index].copyWith(fontSize: fontScale);
    });
  }

  void _setSelectedQrSize(double size) {
    final index = _selectedElementIndex;
    if (index == null || index < 0 || index >= _elements.length) return;
    final element = _elements[index];
    if (element.type != 'qr') return;

    final nextSize = size
        .clamp(ticketTemplateMinQrSize, ticketTemplateMaxQrSize)
        .toDouble();
    final centerX = element.x + element.width / 2;
    final centerY = element.y + element.height / 2;
    setState(() {
      _elements[index] = element.copyWith(
        x: (centerX - nextSize / 2).clamp(0.0, 1.0 - nextSize).toDouble(),
        y: (centerY - nextSize / 2).clamp(0.0, 1.0 - nextSize).toDouble(),
        width: nextSize,
        height: nextSize,
      );
    });
  }

  Future<void> _saveTicketTemplate() async {
    if (_customMode && _backgroundUrl == null) {
      _showMessage('Unggah gambar latar sebelum mengaktifkan template kustom.');
      return;
    }
    if (_customMode &&
        (!_elements.any((element) => element.type == 'qr') ||
            !_elements.any((element) => element.type == 'ticket_code'))) {
      _showMessage('QR dan Kode Tiket wajib tersedia.');
      return;
    }
    setState(() => _isSavingTicket = true);
    var saved = false;
    try {
      await _eventService.saveTicketTemplate(
        widget.eventId,
        mode: _customMode ? 'custom' : 'default',
        elements: _customMode ? _elements : const [],
      );
      saved = true;
      _showMessage('Template tiket berhasil disimpan.');
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage('Template tiket belum dapat disimpan. Silakan coba lagi.');
    } finally {
      if (mounted) setState(() => _isSavingTicket = false);
    }

    if (saved && widget.isFirstSetup && mounted) {
      await _showPublicationDecision();
    }
  }

  Future<void> _showPublicationDecision() async {
    final decision = await showDialog<_PublicationDecision>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Acara siap dipublikasikan'),
        content: const Text(
          'Acara sudah tersimpan. Anda dapat mempublikasikannya sekarang atau melanjutkan sebagai draft.',
        ),
        actions: [
          TextButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(_PublicationDecision.later),
            child: const Text('Nanti Saja'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(
              dialogContext,
            ).pop(_PublicationDecision.publishNow),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
            ),
            child: const Text('Publikasikan Sekarang'),
          ),
        ],
      ),
    );

    if (!mounted || decision == null) return;
    if (decision == _PublicationDecision.later) {
      context.pushReplacement('/event-detail/${widget.eventId}');
      return;
    }

    setState(() => _isPublishing = true);
    try {
      await _eventService.updateEvent(widget.eventId, {'status': 'Published'});
      if (!mounted) return;
      context.pushReplacement('/access-management/${widget.eventId}');
    } catch (_) {
      if (!mounted) return;
      _showMessage(
        'Acara belum dapat dipublikasikan. Periksa koneksi lalu coba lagi.',
      );
    } finally {
      if (mounted) setState(() => _isPublishing = false);
    }
  }

  TextEditingController _emailSubjectController(String kind) =>
      kind == 'otp' ? _otpSubjectController : _ticketSubjectController;

  TextEditingController _emailBodyController(String kind) =>
      kind == 'otp' ? _otpBodyController : _ticketBodyController;

  bool _emailIsActive(String kind) =>
      kind == 'otp' ? _otpEmailActive : _ticketEmailActive;

  void _setEmailActive(String kind, bool value) {
    if (kind == 'otp') {
      _otpEmailActive = value;
    } else {
      _ticketEmailActive = value;
    }
  }

  bool _emailIsSaving(String kind) =>
      kind == 'otp' ? _isSavingOtpEmail : _isSavingTicketEmail;

  void _setEmailSaving(String kind, bool value) {
    if (kind == 'otp') {
      _isSavingOtpEmail = value;
    } else {
      _isSavingTicketEmail = value;
    }
  }

  List<String> _emailTokens(String kind) =>
      kind == 'otp' ? _otpTokenOptions : _ticketEmailTokenOptions;

  Future<void> _toggleEmailTemplate(String kind, bool enabled) async {
    if (enabled) {
      setState(() => _setEmailActive(kind, true));
      return;
    }

    final previous = _emailIsActive(kind);
    setState(() => _setEmailActive(kind, false));
    try {
      await _eventService.saveEmailTemplate(
        widget.eventId,
        kind: kind,
        isActive: false,
        subject: _emailSubjectController(kind).text,
        body: _emailBodyController(kind).text,
      );
      _showMessage(
        'Template bawaan digunakan untuk email ${kind == 'otp' ? 'OTP' : 'ticket'}.',
      );
    } on EventTemplateException catch (error) {
      if (mounted) setState(() => _setEmailActive(kind, previous));
      _showMessage(error.message);
    } catch (_) {
      if (mounted) setState(() => _setEmailActive(kind, previous));
      _showMessage('Status template email belum dapat diperbarui.');
    }
  }

  void _insertEmailToken(TextEditingController controller, String token) {
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

  Future<void> _saveEmailTemplate(String kind) async {
    if (!_emailIsActive(kind)) return;
    setState(() => _setEmailSaving(kind, true));
    try {
      await _eventService.saveEmailTemplate(
        widget.eventId,
        kind: kind,
        isActive: true,
        subject: _emailSubjectController(kind).text,
        body: _emailBodyController(kind).text,
      );
      _showMessage(
        'Template email ${kind == 'otp' ? 'OTP' : 'ticket'} berhasil disimpan.',
      );
    } on EventTemplateException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage('Template email belum dapat disimpan. Silakan coba lagi.');
    } finally {
      if (mounted) setState(() => _setEmailSaving(kind, false));
    }
  }

  Widget _buildTemplateHelp() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F2F2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 20),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Petunjuk penyusunan template\n'
              'Pilih latar, tambahkan data dari palette, lalu geser elemen pada preview. '
              'Tap elemen untuk mengubah ukuran atau menghapusnya. QR dan Kode Tiket wajib; '
              'elemen yang sudah dipakai hilang dari palette.',
              style: TextStyle(fontSize: 12, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTemplatePreview() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = width / math.max(0.1, _backgroundAspectRatio);
        return SizedBox(
          width: width,
          height: height,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xFFF3F3F3),
              borderRadius: BorderRadius.circular(14),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (_localBackground != null)
                    Image.file(_localBackground!, fit: BoxFit.contain)
                  else if (_backgroundUrl != null)
                    Image.network(_backgroundUrl!, fit: BoxFit.contain)
                  else
                    const Center(
                      child: Text('Unggah gambar latar untuk melihat preview'),
                    ),
                  if (_customMode)
                    ..._elements.asMap().entries.map((entry) {
                      final index = entry.key;
                      final element = entry.value;
                      final rawWidth = element.width * width;
                      final rawHeight = element.height * height;
                      final isQr = element.type == 'qr';
                      final elementWidth = isQr
                          ? math.min(rawWidth, rawHeight)
                          : rawWidth;
                      final elementHeight = isQr ? elementWidth : rawHeight;
                      final selected = index == _selectedElementIndex;
                      return Positioned(
                        left:
                            element.x * width +
                            (isQr ? (rawWidth - elementWidth) / 2 : 0),
                        top:
                            element.y * height +
                            (isQr ? (rawHeight - elementHeight) / 2 : 0),
                        width: elementWidth,
                        height: elementHeight,
                        child: GestureDetector(
                          onTap: () =>
                              setState(() => _selectedElementIndex = index),
                          onPanStart: (_) =>
                              setState(() => _selectedElementIndex = index),
                          onPanUpdate: (details) =>
                              _moveElement(index, details, Size(width, height)),
                          child: Container(
                            key: ValueKey('ticket-template-element-$index'),
                            alignment: Alignment.center,
                            padding: EdgeInsets.all(
                              isQr
                                  ? 4
                                  : selected
                                  ? 2
                                  : 0,
                            ),
                            decoration: BoxDecoration(
                              color: isQr
                                  ? Colors.white.withValues(alpha: 0.94)
                                  : Colors.transparent,
                              border: selected
                                  ? Border.all(
                                      color: Colors.black.withValues(
                                        alpha: 0.45,
                                      ),
                                      width: 1,
                                    )
                                  : null,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: isQr
                                ? const FittedBox(
                                    fit: BoxFit.contain,
                                    child: Icon(
                                      Icons.qr_code_2,
                                      color: Colors.black,
                                    ),
                                  )
                                : Text(
                                    _elementLabel(element),
                                    textAlign: TextAlign.center,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.black,
                                      fontWeight: FontWeight.w700,
                                      fontSize: _previewFontSize(
                                        element,
                                        height,
                                      ),
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

  double _previewFontSize(
    TicketTemplateElementModel element,
    double canvasHeight,
  ) {
    final scale = element.fontSize
        .clamp(ticketTemplateMinFontScale, ticketTemplateMaxFontScale)
        .toDouble();
    return math.max(9, math.min(28, element.height * canvasHeight * scale));
  }

  Widget _buildSelectedElementControls() {
    final index = _selectedElementIndex;
    if (index == null || index < 0 || index >= _elements.length) {
      return const SizedBox.shrink();
    }
    final element = _elements[index];
    final isRequired = element.type == 'qr' || element.type == 'ticket_code';
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F7F7),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Elemen dipilih: ${_elementLabel(element)}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          if (element.type == 'qr') ...[
            const SizedBox(height: 8),
            Text('Ukuran QR: ${(element.width * 100).round()}%'),
            Slider(
              key: const ValueKey('ticket-template-qr-size-slider'),
              min: ticketTemplateMinQrSize,
              max: ticketTemplateMaxQrSize,
              divisions: 24,
              value: element.width
                  .clamp(ticketTemplateMinQrSize, ticketTemplateMaxQrSize)
                  .toDouble(),
              label: '${(element.width * 100).round()}%',
              onChanged: _setSelectedQrSize,
            ),
          ] else ...[
            const SizedBox(height: 8),
            Text('Ukuran teks: ${(element.fontSize * 100).round()}%'),
            const SizedBox(height: 5),
            Slider(
              key: const ValueKey('ticket-template-text-size-slider'),
              min: ticketTemplateMinFontScale,
              max: ticketTemplateMaxFontScale,
              divisions: 11,
              value: element.fontSize
                  .clamp(ticketTemplateMinFontScale, ticketTemplateMaxFontScale)
                  .toDouble(),
              label: '${(element.fontSize * 100).round()}%',
              onChanged: _setSelectedFontScale,
            ),
          ],
          if (!isRequired) ...[
            const SizedBox(height: 5),
            TextButton.icon(
              onPressed: _removeSelectedElement,
              icon: const Icon(Icons.delete_outline),
              label: const Text('Hapus elemen'),
              style: TextButton.styleFrom(foregroundColor: Colors.black),
            ),
          ] else
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'Elemen wajib tidak dapat dihapus.',
                style: TextStyle(fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmailEditor({
    required String kind,
    required String title,
    required String description,
  }) {
    final active = _emailIsActive(kind);
    final subjectController = _emailSubjectController(kind);
    final bodyController = _emailBodyController(kind);
    return _sectionCard(
      title: title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('Aktifkan email kustom'),
            subtitle: Text(description),
            value: active,
            activeThumbColor: Colors.black,
            onChanged: (value) {
              _toggleEmailTemplate(kind, value);
            },
          ),
          if (!active)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF2F2F2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('Template bawaan sedang digunakan.'),
            )
          else ...[
            TextField(
              controller: subjectController,
              decoration: const InputDecoration(
                labelText: 'Subjek email',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: bodyController,
              minLines: 6,
              maxLines: 10,
              decoration: const InputDecoration(
                labelText: 'Isi email',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 10),
            const Text('Token tersedia'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _emailTokens(kind).map((token) {
                return OutlinedButton(
                  onPressed: () => _insertEmailToken(bodyController, token),
                  child: Text('[$token]'),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _emailIsSaving(kind)
                    ? null
                    : () => _saveEmailTemplate(kind),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                ),
                child: Text(
                  _emailIsSaving(kind) ? 'Menyimpan...' : 'Simpan Template',
                ),
              ),
            ),
          ],
        ],
      ),
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
                  _buildTemplateHelp(),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _pickBackground,
                    icon: const Icon(Icons.upload_file),
                    label: Text(
                      _backgroundUrl == null
                          ? 'Unggah Gambar Latar'
                          : 'Ganti Gambar Latar',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildTemplatePreview(),
                  _buildSelectedElementControls(),
                  const SizedBox(height: 12),
                  const Text('Elemen tersedia'),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _availableTicketTokens.map((token) {
                      return ActionChip(
                        label: Text('[$token]'),
                        onPressed: () => _addElement(token),
                      );
                    }).toList(),
                  ),
                  if (_availableTicketTokens.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                        'Semua elemen tersedia sudah digunakan pada canvas.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                ],
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSavingTicket || _isPublishing
                        ? null
                        : _saveTicketTemplate,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      _isPublishing
                          ? 'Mempublikasikan...'
                          : _isSavingTicket
                          ? 'Menyimpan...'
                          : 'Simpan Template Tiket',
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_isManualReview) ...[
            const SizedBox(height: 16),
            _buildEmailEditor(
              kind: 'otp',
              title: 'Email OTP',
              description: 'Dikirim saat peserta melakukan verifikasi OTP.',
            ),
            const SizedBox(height: 16),
            _buildEmailEditor(
              kind: 'ticket',
              title: 'Email Ticket / Persetujuan',
              description:
                  'Dikirim setelah peserta Manual Review diterima dan ticket tersedia.',
            ),
          ],
        ],
      ),
    );
  }

  @override
  void dispose() {
    _otpSubjectController.dispose();
    _otpBodyController.dispose();
    _ticketSubjectController.dispose();
    _ticketBodyController.dispose();
    super.dispose();
  }
}
