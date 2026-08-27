import 'package:flutter/material.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../services/poster_validation.dart';
import '../widgets/dashed_border_painter.dart';
import '../widgets/adaptive_event_image.dart';

class _EditableGalleryItem {
  const _EditableGalleryItem.remote(this.remote) : file = null;

  const _EditableGalleryItem.local(this.file) : remote = null;

  final EventMediaModel? remote;
  final File? file;

  bool get isLocal => file != null;
  String get id => remote?.id ?? '';
  String get localIdentity => file?.absolute.path ?? '';
  ImageProvider get image => file == null
      ? NetworkImage(remote!.publicUrl)
      : FileImage(file!);
}

class EditEventScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;
  final Future<File?> Function()? posterPicker;
  final Future<List<File>> Function()? galleryPicker;

  const EditEventScreen({
    super.key,
    required this.eventId,
    this.eventService,
    this.posterPicker,
    this.galleryPicker,
  });

  @override
  State<EditEventScreen> createState() => _EditEventScreenState();
}

class _EditEventScreenState extends State<EditEventScreen> {
  final _formKey = GlobalKey<FormState>();
  late final EventService _eventService;
  final PageController _galleryPageController = PageController();

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _locationController = TextEditingController();
  final TextEditingController _capacityController = TextEditingController();
  final TextEditingController _dateController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();

  DateTime? _selectedDate;
  String _selectedMode = 'Auto-Accept';
  bool _isLoading = true;
  EventModel? _event;
  File? _posterFile;
  final List<_EditableGalleryItem> _galleryItems = [];
  bool _galleryChanged = false;
  bool _posterPending = false;
  int _activeGalleryIndex = 0;

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _loadEvent();
  }

  Future<void> _loadEvent() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      if (!mounted) return;
      setState(() {
        _event = event;
        _nameController.text = event.name;
        _locationController.text = event.location;
        _capacityController.text = event.capacity.toString();
        _descriptionController.text = event.description ?? '';
        _selectedDate = event.date;
        _dateController.text = DateFormat('dd MMM yyyy').format(event.date);
        _selectedMode = event.registrationMode;
        _galleryItems
          ..clear()
          ..addAll(
            (event.media.where((item) => item.role == 'gallery').toList()
                  ..sort((left, right) => left.displayOrder.compareTo(right.displayOrder)))
                .map(_EditableGalleryItem.remote),
          );
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Gagal memuat acara: $e')));
      Navigator.pop(context);
    }
  }

  Future<void> _pickImage() async {
    File? pickedFile;
    if (widget.posterPicker != null) {
      pickedFile = await widget.posterPicker!();
    } else {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (picked != null) pickedFile = File(picked.path);
    }
    if (!mounted) return;
    if (pickedFile == null) return;

    final validationError = await validateEventImageFile(pickedFile);
    if (!mounted) return;
    if (validationError != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(validationError)));
      return;
    }

    setState(() {
      _posterFile = pickedFile;
      _posterPending = true;
    });
  }

  Future<void> _pickGalleryImages() async {
    List<File> pickedFiles;
    if (widget.galleryPicker != null) {
      pickedFiles = await widget.galleryPicker!();
    } else {
      final picked = await ImagePicker().pickMultiImage();
      pickedFiles = picked.map((item) => File(item.path)).toList();
    }
    if (!mounted || pickedFiles.isEmpty) return;

    final existing = _galleryItems
        .where((item) => item.isLocal)
        .map((item) => item.localIdentity)
        .toSet();
    final additions = <File>[];
    for (final file in pickedFiles) {
      if (existing.contains(file.absolute.path)) continue;
      final validationError = await validateEventImageFile(file);
      if (!mounted) return;
      if (validationError != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(validationError)));
        return;
      }
      existing.add(file.absolute.path);
      additions.add(file);
    }
    if (additions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Foto yang dipilih sudah ada di galeri.')),
      );
      return;
    }
    if (_galleryItems.length + additions.length > 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Maksimal 5 foto galeri. Sisa slot: ${5 - _galleryItems.length}.',
          ),
        ),
      );
      return;
    }
    setState(() {
      _galleryItems.addAll(additions.map(_EditableGalleryItem.local));
      _galleryChanged = true;
      _activeGalleryIndex = _galleryItems.length - additions.length;
    });
    _moveToGalleryPage(_activeGalleryIndex);
  }

  void _removeGalleryAt(int index) {
    setState(() {
      _galleryItems.removeAt(index);
      _galleryChanged = true;
      _activeGalleryIndex = _galleryItems.isEmpty
          ? 0
          : _activeGalleryIndex.clamp(0, _galleryItems.length - 1);
    });
    _moveToGalleryPage(_activeGalleryIndex);
  }

  void _moveGallery(int offset) {
    final destination = _activeGalleryIndex + offset;
    if (destination < 0 || destination >= _galleryItems.length) return;
    setState(() {
      final item = _galleryItems.removeAt(_activeGalleryIndex);
      _galleryItems.insert(destination, item);
      _activeGalleryIndex = destination;
      _galleryChanged = true;
    });
    _moveToGalleryPage(destination);
  }

  void _moveToGalleryPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          !_galleryPageController.hasClients ||
          _galleryItems.isEmpty) {
        return;
      }
      _galleryPageController.animateToPage(
        index.clamp(0, _galleryItems.length - 1),
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFF000000),
              onPrimary: Colors.white,
              onSurface: Color(0xFF1A1C1C),
            ),
          ),
          child: child!,
        );
      },
    );
    if (!mounted) return;
    if (date != null) {
      setState(() {
        _selectedDate = date;
        _dateController.text = DateFormat('dd MMM yyyy').format(date);
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    var metadataPersisted = false;
    try {
      final data = {
        'name': _nameController.text,
        'location': _locationController.text,
        // [MOB-BUG-007] FIX: int.tryParse agar tidak crash FormatException
        'capacity': int.tryParse(_capacityController.text) ?? 0,
        'date': _selectedDate!.toIso8601String(),
        'description': _descriptionController.text,
        'registration_mode': _selectedMode,
      };

      await _eventService.updateEvent(widget.eventId, data);
      metadataPersisted = true;
      await _syncPendingMedia();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Acara berhasil diperbarui!')),
      );
      Navigator.pop(context, true); // Return true to signal refresh
    } on EventMediaUploadException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            metadataPersisted
                ? 'Data acara sudah tersimpan, tetapi media belum diperbarui. ${error.message}'
                : error.message,
          ),
          action: metadataPersisted && (_posterPending || _galleryChanged)
              ? SnackBarAction(
                  label: 'UNGGAH ULANG',
                  onPressed: _retryPendingMedia,
                )
              : null,
        ),
      );
      setState(() => _isLoading = false);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Acara belum dapat diperbarui. Silakan coba lagi.'),
        ),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _retryPendingMedia() async {
    setState(() => _isLoading = true);
    try {
      await _syncPendingMedia();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Media acara berhasil diperbarui.')),
      );
      Navigator.pop(context, true);
    } on EventMediaUploadException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _syncPendingMedia() async {
    if (_posterPending && _posterFile != null) {
      await _eventService.uploadEventPoster(widget.eventId, _posterFile!.path);
      _posterPending = false;
    }
    if (!_galleryChanged) return;

    final localItems = _galleryItems.where((item) => item.isLocal).toList();
    if (localItems.isNotEmpty) {
      final added = await _eventService.appendEventGallery(
        widget.eventId,
        localItems.map((item) => item.file!.path).toList(),
      );
      if (added.length != localItems.length) {
        throw const EventMediaUploadException(
          'Sebagian foto galeri belum dapat diproses. Silakan unggah ulang.',
        );
      }
      var nextAdded = 0;
      for (var index = 0; index < _galleryItems.length; index += 1) {
        if (_galleryItems[index].isLocal) {
          _galleryItems[index] = _EditableGalleryItem.remote(added[nextAdded]);
          nextAdded += 1;
        }
      }
    }

    final galleryIds = _galleryItems.map((item) => item.id).toList();
    if (galleryIds.any((id) => id.isEmpty)) {
      throw const EventMediaUploadException(
        'Foto galeri belum siap diperbarui. Silakan coba lagi.',
      );
    }
    await _eventService.replaceEventGallery(widget.eventId, galleryIds);
    _galleryChanged = false;
  }

  @override
  void dispose() {
    _galleryPageController.dispose();
    _nameController.dispose();
    _locationController.dispose();
    _capacityController.dispose();
    _dateController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Widget _buildGallerySection() {
    final count = _galleryItems.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Foto Galeri ($count/5)',
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1A1C1C),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Opsional. Foto lama tetap tersimpan sampai Anda menghapusnya.',
          style: TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const ValueKey('edit-gallery-picker'),
          onPressed: count == 5 ? null : _pickGalleryImages,
          icon: const Icon(Icons.collections_outlined),
          label: const Text('Tambah Foto Galeri'),
        ),
        if (count > 0) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 208,
            child: PageView.builder(
              controller: _galleryPageController,
              itemCount: count,
              onPageChanged: (index) {
                if (mounted) setState(() => _activeGalleryIndex = index);
              },
              itemBuilder: (context, index) {
                final item = _galleryItems[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      AdaptiveEventImage(
                        image: item.image,
                        frameAspectRatio: 16 / 10,
                        expand: true,
                        blurredBackdrop: true,
                        backgroundColor: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      Positioned(
                        right: 8,
                        top: 8,
                        child: IconButton.filledTonal(
                          key: ValueKey('edit-gallery-remove-$index'),
                          tooltip: 'Hapus foto galeri ${index + 1}',
                          onPressed: () => _removeGalleryAt(index),
                          icon: const Icon(Icons.close),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              IconButton(
                key: const ValueKey('edit-gallery-move-previous'),
                tooltip: 'Pindahkan foto ke kiri',
                onPressed: _activeGalleryIndex == 0
                    ? null
                    : () => _moveGallery(-1),
                icon: const Icon(Icons.arrow_back),
              ),
              Expanded(
                child: SizedBox(
                  height: 56,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: count,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final selected = index == _activeGalleryIndex;
                      return InkWell(
                        onTap: () {
                          setState(() => _activeGalleryIndex = index);
                          _moveToGalleryPage(index);
                        },
                        borderRadius: BorderRadius.circular(6),
                        child: Container(
                          width: 72,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: selected
                                  ? Colors.black
                                  : const Color(0xFFC4C7C7),
                              width: selected ? 2 : 1,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Image(
                            image: _galleryItems[index].image,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => const ColoredBox(
                              color: Color(0xFFE5E2E1),
                              child: Icon(Icons.broken_image_outlined),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              IconButton(
                key: const ValueKey('edit-gallery-move-next'),
                tooltip: 'Pindahkan foto ke kanan',
                onPressed: _activeGalleryIndex == count - 1
                    ? null
                    : () => _moveGallery(1),
                icon: const Icon(Icons.arrow_forward),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildTextField({
    required String label,
    required String hint,
    required TextEditingController controller,
    IconData? icon,
    TextInputType? keyboardType,
    int maxLines = 1,
    bool readOnly = false,
    VoidCallback? onTap,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 4),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: Color(0xFF444748),
            ),
          ),
        ),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          maxLines: maxLines,
          readOnly: readOnly,
          onTap: onTap,
          validator: validator,
          style: const TextStyle(fontSize: 14, color: Color(0xFF1A1C1C)),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFFC4C7C7), fontSize: 14),
            prefixIcon: icon != null
                ? Icon(icon, color: const Color(0xFFC4C7C7))
                : null,
            filled: true,
            fillColor: const Color(0xFFFFFFFF),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFC4C7C7)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF000000)),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Colors.red),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Colors.red),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFFF3F3F3);
    const primaryColor = Color(0xFF000000);
    const primaryContainerColor = Color(0xFFE5E2E1);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFF9F9F9),
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Color(0xFF444748)),
        title: const Text(
          'Lihat/Edit Detail Acara',
          style: TextStyle(
            color: Color(0xFF1A1C1C),
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFC4C7C7), height: 1.0),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: primaryColor))
          : SingleChildScrollView(
              padding: const EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: 20,
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Image Section
                    GestureDetector(
                      key: const ValueKey('edit-poster-picker'),
                      onTap: _pickImage,
                      child: CustomPaint(
                        painter: DashedBorderPainter(
                          color: primaryContainerColor,
                          strokeWidth: 2,
                          borderRadius: 10,
                        ),
                        child: _posterFile != null
                            ? SizedBox(
                                width: double.infinity,
                                height: 260,
                                child: AdaptiveEventImage(
                                  image: FileImage(_posterFile!),
                                  frameAspectRatio: 4 / 3,
                                  expand: true,
                                  blurredBackdrop: true,
                                  backgroundColor: Colors.white,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              )
                            : _event?.posterUrl != null &&
                                  _event!.posterUrl!.isNotEmpty
                            ? SizedBox(
                                width: double.infinity,
                                height: 260,
                                child: AdaptiveEventImage(
                                  image: NetworkImage(_event!.posterUrl!),
                                  frameAspectRatio: 4 / 3,
                                  expand: true,
                                  blurredBackdrop: true,
                                  backgroundColor: Colors.white,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              )
                            : Container(
                                width: double.infinity,
                                height: 180,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.add_photo_alternate,
                                      size: 40,
                                      color: primaryContainerColor,
                                    ),
                                    const SizedBox(height: 8),
                                    const Text(
                                      'Pilih poster (rasio asli dipertahankan)',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                        color: Color(0xFF444748),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildGallerySection(),
                    const SizedBox(height: 24),

                    // Forms
                    _buildTextField(
                      label: 'Nama Acara',
                      hint: 'Masukkan nama acara...',
                      controller: _nameController,
                      validator: (v) => v!.isEmpty ? 'Harus diisi' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Lokasi',
                      hint: 'Lokasi acara...',
                      icon: Icons.location_on,
                      controller: _locationController,
                      validator: (v) => v!.isEmpty ? 'Harus diisi' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Batas Kuota',
                      hint: '0',
                      icon: Icons.group,
                      keyboardType: TextInputType.number,
                      controller: _capacityController,
                      // [MOB-BUG-007] FIX: Validasi kapasitas komprehensif (seperti di CreateEventScreen)
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Harus diisi';
                        final parsed = int.tryParse(v);
                        if (parsed == null) {
                          return 'Harus berupa angka (misal: 100)';
                        }
                        if (parsed <= 0) return 'Kuota harus lebih dari 0';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Tanggal',
                      hint: _selectedDate == null
                          ? 'Pilih Tanggal Acara'
                          : DateFormat('dd MMM yyyy').format(_selectedDate!),
                      icon: Icons.calendar_today,
                      controller: _dateController,
                      readOnly: true,
                      onTap: _pickDate,
                      validator: (v) =>
                          _selectedDate == null ? 'Harus diisi' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Deskripsi Tambahan',
                      hint: 'Detail tambahan acara...',
                      controller: _descriptionController,
                      maxLines: 3,
                    ),
                    const SizedBox(height: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(left: 4, bottom: 4),
                          child: Text(
                            'Mode Pendaftaran',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF444748),
                            ),
                          ),
                        ),
                        DropdownButtonFormField<String>(
                          initialValue: _selectedMode,
                          items: ['Auto-Accept', 'Manual Review']
                              .map(
                                (mode) => DropdownMenuItem(
                                  value: mode,
                                  child: Text(
                                    mode,
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (val) {
                            if (val != null) {
                              setState(() => _selectedMode = val);
                            }
                          },
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: const Color(0xFFFFFFFF),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 14,
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: Color(0xFFC4C7C7),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: Color(0xFF000000),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
      // [MOB-BUG-004] FIX: bottomNavigationBar otomatis handle system insets (bukan bottomSheet)
      // [MOB-BUG-012] FIX: Container di luar SafeArea agar warna solid sampai tepi layar
      bottomNavigationBar: _isLoading
          ? null
          : Container(
              key: const ValueKey('edit-event-bottom-action'),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Color(0xFFC4C7C7))),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text(
                        'Simpan Perubahan',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
