import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../services/event_service.dart';
import '../services/poster_validation.dart';
import '../widgets/dashed_border_painter.dart';
import '../widgets/adaptive_event_image.dart';

class CreateEventScreen extends StatefulWidget {
  const CreateEventScreen({
    super.key,
    this.eventService,
    this.initialPosterFile,
    this.initialGalleryFiles = const [],
  });

  final EventService? eventService;
  final File? initialPosterFile;
  final List<File> initialGalleryFiles;

  @override
  State<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends State<CreateEventScreen> {
  final _formKey = GlobalKey<FormState>();
  late final EventService _eventService;
  final _galleryPageController = PageController();

  final _nameController = TextEditingController();
  final _locationController = TextEditingController();
  final _capacityController = TextEditingController();
  final _descriptionController = TextEditingController(); // Added description
  final _dateController = TextEditingController();

  DateTime? _selectedDate;
  File? _posterFile;
  final List<File> _galleryFiles = [];
  String? _posterError;
  String? _galleryError;
  late final String _idempotencyKey;
  String? _pendingMediaEventId;
  bool _isLoading = false;
  int _activeGalleryIndex = 0;
  String _registrationMode = 'Auto-Accept';

  // [MOB-BUG-005] FIX: Dispose controllers untuk mencegah memory leak
  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _posterFile = widget.initialPosterFile;
    _galleryFiles.addAll(
      uniqueEventImageFiles(
        widget.initialGalleryFiles,
      ).take(maxEventGalleryImages),
    );
    final random = Random.secure();
    final randomPart = List.generate(
      32,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    _idempotencyKey = '${DateTime.now().microsecondsSinceEpoch}-$randomPart';
  }

  @override
  void dispose() {
    _galleryPageController.dispose();
    _nameController.dispose();
    _locationController.dispose();
    _capacityController.dispose();
    _descriptionController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFF000000), // header background color
              onPrimary: Colors.white, // header text color
              onSurface: Color(0xFF1A1C1C), // body text color
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

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (!mounted) return;
    if (picked != null) {
      final file = File(picked.path);
      final validationError = await validateEventImageFile(file);
      if (!mounted) return;
      if (validationError != null) {
        setState(() => _posterError = validationError);
        return;
      }

      setState(() {
        _posterFile = file;
        _posterError = null;
      });
    }
  }

  Future<void> _pickGalleryImages() async {
    final picker = ImagePicker();
    final pickedImages = await picker.pickMultiImage();
    if (!mounted) return;
    if (pickedImages.isEmpty) return;

    final existingFiles = _galleryFiles.map(eventImageFileIdentity).toSet();
    final selectedFiles =
        uniqueEventImageFiles(pickedImages.map((picked) => File(picked.path)))
            .where(
              (file) => !existingFiles.contains(eventImageFileIdentity(file)),
            )
            .toList();

    if (selectedFiles.isEmpty) {
      setState(() => _galleryError = 'Foto yang dipilih sudah ada di galeri.');
      return;
    }

    final remainingSlots = maxEventGalleryImages - _galleryFiles.length;
    if (selectedFiles.length > remainingSlots) {
      setState(
        () => _galleryError =
            'Maksimal $maxEventGalleryImages foto galeri tambahan. '
            'Anda memilih ${selectedFiles.length}, sisa slot: $remainingSlots.',
      );
      return;
    }

    for (final file in selectedFiles) {
      final validationError = await validateEventImageFile(file);
      if (!mounted) return;
      if (validationError != null) {
        setState(() => _galleryError = validationError);
        return;
      }
    }

    setState(() {
      _galleryFiles.addAll(selectedFiles);
      _galleryError = null;
      _activeGalleryIndex = _galleryFiles.length - selectedFiles.length;
    });
    _moveToGalleryPage(_activeGalleryIndex);
  }

  bool _validateMediaSelection() {
    final posterError = _posterFile == null
        ? 'Poster acara wajib diunggah.'
        : null;
    final galleryError = _galleryFiles.length > maxEventGalleryImages
        ? 'Maksimal $maxEventGalleryImages foto galeri tambahan.'
        : null;

    setState(() {
      _posterError = posterError;
      _galleryError = galleryError;
    });
    return posterError == null && galleryError == null;
  }

  Future<void> _submit() async {
    final formValid = _formKey.currentState!.validate();
    final mediaValid = _validateMediaSelection();
    if (!formValid || !mediaValid) return;
    if (_selectedDate == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Pilih tanggal acara')));
      return;
    }
    setState(() => _isLoading = true);

    try {
      final data = {
        'name': _nameController.text,
        'location': _locationController.text,
        // [BUG-066] FIX: Cast ke int di payload, bukan kirim string mentah ke API
        'capacity': int.tryParse(_capacityController.text) ?? 0,
        'date': _selectedDate!.toIso8601String(),
        'description': _descriptionController.text,
        'registration_mode': _registrationMode,
      };

      final eventId = await _eventService.createEvent(
        data,
        posterPath: _posterFile?.path,
        galleryPaths: _galleryFiles.map((file) => file.path).toList(),
        idempotencyKey: _idempotencyKey,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Acara berhasil dibuat! Sekarang susun form pendaftaran.',
          ),
        ),
      );
      // [BUG-054] FIX: Redirect ke /form-builder dulu, bukan langsung /access-management
      // Alur yang benar: Buat Acara → Form Builder → Kelola Akses
      // extra: 'first_setup' memberi tahu FormBuilderScreen untuk redirect ke access-management setelah simpan
      context.pushReplacement('/form-builder/$eventId', extra: 'first_setup');
    } on EventMediaUploadException catch (error) {
      if (!mounted) return;
      if (error.metadataPersisted && error.eventId != null) {
        setState(() => _pendingMediaEventId = error.eventId);
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.message),
          action: _pendingMediaEventId == null
              ? null
              : SnackBarAction(
                  label: 'UNGGAH ULANG',
                  onPressed: _retryPendingMedia,
                ),
        ),
      );
    } on EventCreationException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Acara belum dapat dibuat. Silakan coba lagi.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _retryPendingMedia() async {
    final eventId = _pendingMediaEventId;
    final poster = _posterFile;
    if (eventId == null || poster == null) return;

    setState(() => _isLoading = true);
    try {
      await _eventService.uploadEventMedia(
        eventId,
        coverPath: poster.path,
        galleryPaths: _galleryFiles.map((file) => file.path).toList(),
      );
      if (!mounted) return;
      setState(() => _pendingMediaEventId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Media berhasil diunggah. Sekarang susun form pendaftaran.',
          ),
        ),
      );
      context.pushReplacement('/form-builder/$eventId', extra: 'first_setup');
    } on EventMediaUploadException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _moveToGalleryPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          !_galleryPageController.hasClients ||
          _galleryFiles.isEmpty) {
        return;
      }
      _galleryPageController.animateToPage(
        index.clamp(0, _galleryFiles.length - 1),
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  void _removeGalleryAt(int index) {
    setState(() {
      _galleryFiles.removeAt(index);
      _activeGalleryIndex = _galleryFiles.isEmpty
          ? 0
          : _activeGalleryIndex.clamp(0, _galleryFiles.length - 1);
      _galleryError = null;
    });
    _moveToGalleryPage(_activeGalleryIndex);
  }

  void _moveGallery(int offset) {
    final destination = _activeGalleryIndex + offset;
    if (destination < 0 || destination >= _galleryFiles.length) return;

    setState(() {
      final image = _galleryFiles.removeAt(_activeGalleryIndex);
      _galleryFiles.insert(destination, image);
      _activeGalleryIndex = destination;
    });
    _moveToGalleryPage(destination);
  }

  Future<void> _showImagePreview(File image, String title) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(title: Text(title)),
          body: Center(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 4,
              child: Image.file(image, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPosterSection() {
    const primaryContainerColor = Color(0xFFE5E2E1);
    final poster = _posterFile;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Poster Acara (Wajib)',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1A1C1C),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'JPG, PNG, atau WebP · maks. 5 MB · gambar lengkap tetap terlihat.',
          style: TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        if (poster == null)
          GestureDetector(
            onTap: _pickImage,
            child: CustomPaint(
              painter: DashedBorderPainter(
                color: primaryContainerColor,
                strokeWidth: 2,
                borderRadius: 10,
              ),
              child: Container(
                width: double.infinity,
                height: 180,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.add_photo_alternate_outlined,
                      size: 40,
                      color: primaryContainerColor,
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Unggah Poster Acara',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF444748),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          SizedBox(
            key: const ValueKey('event-poster-preview'),
            height: 260,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Semantics(
                  button: true,
                  label: 'Lihat poster layar penuh',
                  child: InkWell(
                    onTap: () => _showImagePreview(poster, 'Poster Acara'),
                    borderRadius: BorderRadius.circular(10),
                    child: AdaptiveEventImage(
                      image: FileImage(poster),
                      frameAspectRatio: 4 / 3,
                      expand: true,
                      blurredBackdrop: true,
                      backgroundColor: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                Positioned(
                  right: 8,
                  bottom: 8,
                  child: FilledButton.tonalIcon(
                    onPressed: _pickImage,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Ganti'),
                  ),
                ),
              ],
            ),
          ),
        if (_posterError != null) ...[
          const SizedBox(height: 8),
          Text(
            _posterError!,
            style: const TextStyle(color: Color(0xFFBA1A1A), fontSize: 12),
          ),
        ],
      ],
    );
  }

  Widget _buildGallerySection() {
    final galleryCount = _galleryFiles.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Foto Galeri ($galleryCount/$maxEventGalleryImages)',
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1A1C1C),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Opsional · maksimal 5 foto tambahan. Poster tidak dihitung.',
          style: TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: galleryCount == maxEventGalleryImages
              ? null
              : _pickGalleryImages,
          icon: const Icon(Icons.collections_outlined),
          label: const Text('Tambah Foto Galeri'),
        ),
        if (_galleryError != null) ...[
          const SizedBox(height: 8),
          Text(
            _galleryError!,
            style: const TextStyle(color: Color(0xFFBA1A1A), fontSize: 12),
          ),
        ],
        if (galleryCount > 0) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 208,
            child: PageView.builder(
              controller: _galleryPageController,
              itemCount: galleryCount,
              onPageChanged: (index) {
                if (mounted) setState(() => _activeGalleryIndex = index);
              },
              itemBuilder: (context, index) {
                final image = _galleryFiles[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      InkWell(
                        onTap: () => _showImagePreview(
                          image,
                          'Foto Galeri ${index + 1}',
                        ),
                        borderRadius: BorderRadius.circular(10),
                        child: AdaptiveEventImage(
                          image: FileImage(image),
                          frameAspectRatio: 16 / 10,
                          expand: true,
                          blurredBackdrop: true,
                          backgroundColor: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      Positioned(
                        right: 8,
                        top: 8,
                        child: IconButton.filledTonal(
                          key: ValueKey('gallery-remove-$index'),
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
                key: const ValueKey('gallery-move-previous'),
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
                    itemCount: galleryCount,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final selected = index == _activeGalleryIndex;
                      return Semantics(
                        button: true,
                        label: 'Foto galeri ${index + 1}',
                        child: InkWell(
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
                            child: Image.file(
                              _galleryFiles[index],
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const ColoredBox(
                                color: Color(0xFFE5E2E1),
                                child: Icon(Icons.broken_image_outlined),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              IconButton(
                key: const ValueKey('gallery-move-next'),
                tooltip: 'Pindahkan foto ke kanan',
                onPressed: _activeGalleryIndex == galleryCount - 1
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

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFF9F9F9),
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Color(0xFF444748)),
        title: const Text(
          'Buat Acara Baru',
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
                    _buildPosterSection(),
                    const SizedBox(height: 20),
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
                      hint: '100',
                      icon: Icons.group,
                      keyboardType: TextInputType.number,
                      controller: _capacityController,
                      // [BUG-066] FIX: Validasi harus angka positif, bukan hanya tidak kosong
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
                          initialValue: _registrationMode,
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
                              setState(() => _registrationMode = val);
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
      bottomNavigationBar: Container(
        key: const ValueKey('create-event-bottom-action'),
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
                onPressed: _isLoading
                    ? null
                    : _pendingMediaEventId == null
                    ? _submit
                    : _retryPendingMedia,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: Text(
                  _pendingMediaEventId == null
                      ? 'Simpan Acara'
                      : 'Unggah Ulang Media',
                  style: const TextStyle(
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
