import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../models/event_model.dart';
import '../models/poster_aspect.dart';
import '../services/event_service.dart';
import '../services/poster_validation.dart';
import '../widgets/dashed_border_painter.dart';
import '../widgets/adaptive_event_image.dart';
import '../widgets/poster_crop_editor.dart';

class CreateEventScreen extends StatefulWidget {
  const CreateEventScreen({
    super.key,
    this.eventService,
    this.initialPosterFile,
    this.initialGalleryFiles = const [],
    this.galleryPicker,
    this.imageValidator,
    this.posterCropper,
  });

  final EventService? eventService;
  final File? initialPosterFile;
  final List<File> initialGalleryFiles;
  final Future<List<XFile>> Function()? galleryPicker;
  final Future<String?> Function(File file)? imageValidator;
  final Future<File?> Function(File file, double aspectRatio)? posterCropper;

  @override
  State<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends State<CreateEventScreen> {
  final _formKey = GlobalKey<FormState>();
  late final EventService _eventService;
  final _mediaPageController = PageController();

  final _nameController = TextEditingController();
  final _locationController = TextEditingController();
  final _capacityController = TextEditingController();
  final _descriptionController = TextEditingController(); // Added description
  final _dateController = TextEditingController();

  DateTime? _selectedDate;
  // One user-facing collection. The first item is persisted as the legacy
  // cover and the rest as legacy gallery rows by EventService.
  final List<File> _posterFiles = [];
  String? _posterError;
  late final String _idempotencyKey;
  String? _pendingMediaEventId;
  bool _isLoading = false;
  int _activeMediaIndex = 0;
  String _registrationMode = 'Auto-Accept';
  PosterAspectMode _posterAspectMode = PosterAspectMode.landscape;

  // [MOB-BUG-005] FIX: Dispose controllers untuk mencegah memory leak
  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _posterFiles.addAll(
      uniqueEventImageFiles([
        if (widget.initialPosterFile != null) widget.initialPosterFile!,
        ...widget.initialGalleryFiles,
      ]).take(maxEventPosterImages),
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
    _mediaPageController.dispose();
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

  Future<void> _pickPosterImages() async {
    final pickedImages =
        await (widget.galleryPicker?.call() ?? ImagePicker().pickMultiImage());
    if (!mounted) return;
    if (pickedImages.isEmpty) return;

    final existingFiles = _posterFiles.map(eventImageFileIdentity).toSet();
    final selectedFiles =
        uniqueEventImageFiles(pickedImages.map((picked) => File(picked.path)))
            .where(
              (file) => !existingFiles.contains(eventImageFileIdentity(file)),
            )
            .toList();

    if (selectedFiles.isEmpty) {
      setState(() => _posterError = 'Selected photos already exist.');
      return;
    }

    final remainingSlots = maxEventPosterImages - _posterFiles.length;
    if (selectedFiles.length > remainingSlots) {
      setState(
        () => _posterError =
            'Maximum $maxEventPosterImages posters. '
            'You selected ${selectedFiles.length}, remaining slots: $remainingSlots.',
      );
      return;
    }

    final croppedFiles = <File>[];
    for (final file in selectedFiles) {
      final validationError =
          await (widget.imageValidator ?? validateEventImageFile)(file);
      if (!mounted) return;
      if (validationError != null) {
        setState(() => _posterError = validationError);
        return;
      }

      final cropped = await _cropPoster(file);
      if (!mounted) return;
      if (cropped == null) continue;
      final croppedValidationError =
          await (widget.imageValidator ?? validateEventImageFile)(cropped);
      if (!mounted) return;
      if (croppedValidationError != null) {
        setState(() => _posterError = croppedValidationError);
        return;
      }
      croppedFiles.add(cropped);
    }

    if (croppedFiles.isEmpty) return;

    final firstNewMediaIndex = _posterFiles.length;
    setState(() {
      _posterFiles.addAll(croppedFiles);
      _posterError = null;
      _activeMediaIndex = firstNewMediaIndex;
    });
    _moveToMediaPage(_activeMediaIndex);
  }

  Future<File?> _cropPoster(File file) {
    if (widget.posterCropper != null) {
      return widget.posterCropper!(file, _posterAspectMode.ratio);
    }
    // The injected picker is a deterministic test seam. Production uses the
    // crop editor below, while picker-based widget tests can assert state
    // changes without opening a modal dialog.
    if (widget.galleryPicker != null) return Future.value(file);
    return PosterCropEditor.show(
      context: context,
      file: file,
      aspectRatio: _posterAspectMode.ratio,
    );
  }

  bool _validateMediaSelection() {
    final posterError = _posterFiles.isEmpty
        ? 'Event poster is required.'
        : null;
    final tooManyError = _posterFiles.length > maxEventPosterImages
        ? 'Maximum $maxEventPosterImages event posters.'
        : null;

    setState(() {
      _posterError = posterError ?? tooManyError;
    });
    return posterError == null && tooManyError == null;
  }

  Future<void> _submit() async {
    final formValid = _formKey.currentState!.validate();
    final mediaValid = _validateMediaSelection();
    if (!formValid || !mediaValid) return;
    if (_selectedDate == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Select event date')));
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
        'poster_aspect_mode': _posterAspectMode.wireValue,
      };

      final eventId = await _eventService.createEvent(
        data,
        posterPath: _posterFiles.first.path,
        galleryPaths: _posterFiles.skip(1).map((file) => file.path).toList(),
        idempotencyKey: _idempotencyKey,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Event created! Now set up the registration form.',
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
                  label: 'RE-UPLOAD',
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
          content: Text('Event could not be created. Please try again.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _retryPendingMedia() async {
    final eventId = _pendingMediaEventId;
    if (eventId == null || _posterFiles.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await _eventService.uploadEventMedia(
        eventId,
        coverPath: _posterFiles.first.path,
        galleryPaths: _posterFiles.skip(1).map((file) => file.path).toList(),
      );
      late final EventModel refreshedEvent;
      try {
        refreshedEvent = await _eventService.getEventDetail(eventId);
      } catch (_) {
        throw const EventMediaUploadException(
          'Media uploaded, but the latest status could not be loaded. Please try again.',
        );
      }
      if (!_hasPersistedMedia(refreshedEvent)) {
        throw const EventMediaUploadException(
          'Media uploaded, but could not be confirmed from the server. Please try again.',
        );
      }
      if (!mounted) return;
      setState(() => _pendingMediaEventId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Media successfully uploaded. Now set up the registration form.',
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

  bool _hasPersistedMedia(EventModel event) {
    if (event.posterUrl?.trim().isNotEmpty == true) return true;
    return event.media.any(
      (media) => media.publicUrl.trim().isNotEmpty,
    );
  }

  void _moveToMediaPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_mediaPageController.hasClients) {
        return;
      }
      _mediaPageController.animateToPage(
        index
            .clamp(0, _posterFiles.isEmpty ? 0 : _posterFiles.length - 1)
            .toInt(),
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  void _removePosterAt(int index) {
    if (index < 0 || index >= _posterFiles.length) return;
    setState(() {
      _posterFiles.removeAt(index);
      if (_posterFiles.isEmpty) {
        _activeMediaIndex = 0;
      } else {
        if (_activeMediaIndex > index) _activeMediaIndex -= 1;
        _activeMediaIndex = _activeMediaIndex
            .clamp(0, _posterFiles.length - 1)
            .toInt();
      }
      _posterError = null;
    });
    _moveToMediaPage(_activeMediaIndex);
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

  Widget _buildPosterPlaceholder() {
    const primaryContainerColor = Color(0xFFE5E2E1);
    return CustomPaint(
      painter: DashedBorderPainter(
        color: primaryContainerColor,
        strokeWidth: 2,
        borderRadius: 10,
      ),
      child: Container(
        width: double.infinity,
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
              'Upload Event Poster',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF444748),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaCarousel() {
    final mediaCount = _posterFiles.isEmpty ? 1 : _posterFiles.length;

    return Column(
      children: [
        AspectRatio(
          key: const ValueKey('event-poster-preview'),
          aspectRatio: _posterAspectMode.ratio,
          child: PageView.builder(
              controller: _mediaPageController,
              itemCount: mediaCount,
              onPageChanged: (index) {
                if (mounted) setState(() => _activeMediaIndex = index);
              },
              itemBuilder: (context, index) {
                final image = _posterFiles.isEmpty ? null : _posterFiles[index];
                final title = 'Poster ${index + 1}';

                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      image == null
                          ? _buildPosterPlaceholder()
                          : Semantics(
                              button: true,
                              label: 'View $title in full screen',
                              child: InkWell(
                                onTap: () => _showImagePreview(image, title),
                                borderRadius: BorderRadius.circular(10),
                                child: AdaptiveEventImage(
                                  image: FileImage(image),
                                  frameAspectRatio: _posterAspectMode.ratio,
                                  expand: true,
                                  fit: BoxFit.contain,
                                  blurredBackdrop: false,
                                  backgroundColor: Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                      if (image != null)
                        Positioned(
                          right: 8,
                          top: 8,
                          child: IconButton.filledTonal(
                            key: ValueKey('event-poster-remove-$index'),
                            tooltip: 'Remove $title',
                            onPressed: () => _removePosterAt(index),
                            icon: const Icon(Icons.close),
                          ),
                        ),
                    ],
                  ),
                );
              },
          ),
        ),
        if (_posterFiles.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _activeMediaIndex == 0
                  ? 'Main poster'
                  : 'Poster ${_activeMediaIndex + 1} of ${_posterFiles.length}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
            ),
          ),
      ],
    );
  }

  Widget _buildPosterSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Event Poster (${_posterFiles.length}/$maxEventPosterImages)',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1A1C1C),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Minimum 1 image, maximum 5 · JPG, PNG, or WebP · max 5 MB.',
          style: TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<PosterAspectMode>(
          key: const ValueKey('event-poster-aspect-mode'),
          initialValue: _posterAspectMode,
          decoration: const InputDecoration(
            labelText: 'Poster format',
            border: OutlineInputBorder(),
          ),
          items: PosterAspectMode.values
              .map(
                (mode) => DropdownMenuItem(
                  value: mode,
                  child: Text(mode.label),
                ),
              )
              .toList(),
          onChanged: _posterFiles.isNotEmpty
              ? null
              : (value) {
                  if (value == null || !mounted) return;
                  setState(() {
                    _posterAspectMode = value;
                    _posterError = null;
                  });
                },
        ),
        if (_posterFiles.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'Format is locked after the first poster is selected.',
              style: TextStyle(fontSize: 11, color: Color(0xFF5F6368)),
            ),
          ),
        const SizedBox(height: 8),
        _buildMediaCarousel(),
        const SizedBox(height: 4),
        Text(
          _posterFiles.isEmpty
              ? 'No poster selected.'
              : 'Selected posters (${_posterFiles.length}/$maxEventPosterImages). '
                    'The first image becomes the main poster.',
          style: const TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const ValueKey('event-poster-upload'),
          onPressed: _posterFiles.length == maxEventPosterImages
              ? null
              : _pickPosterImages,
          icon: const Icon(Icons.add_photo_alternate_outlined),
          label: Text(_posterFiles.isEmpty ? 'Select Poster' : 'Add Poster'),
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
          'Create New Event',
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
                    const SizedBox(height: 24),

                    // Forms
                    _buildTextField(
                      label: 'Event Name',
                      hint: 'Enter event name...',
                      controller: _nameController,
                      validator: (v) => v!.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Location',
                      hint: 'Event location...',
                      icon: Icons.location_on,
                      controller: _locationController,
                      validator: (v) => v!.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Capacity Limit',
                      hint: '100',
                      icon: Icons.group,
                      keyboardType: TextInputType.number,
                      controller: _capacityController,
                      // [BUG-066] FIX: Validasi harus angka positif, bukan hanya tidak kosong
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Required';
                        final parsed = int.tryParse(v);
                        if (parsed == null) {
                          return 'Must be a number (e.g. 100)';
                        }
                        if (parsed <= 0) return 'Capacity must be greater than 0';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Date',
                      hint: _selectedDate == null
                          ? 'Select Event Date'
                          : DateFormat('dd MMM yyyy').format(_selectedDate!),
                      icon: Icons.calendar_today,
                      controller: _dateController,
                      readOnly: true,
                      onTap: _pickDate,
                      validator: (v) =>
                          _selectedDate == null ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),

                    _buildTextField(
                      label: 'Additional Description',
                      hint: 'Additional event details...',
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
                            'Registration Mode',
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
                      ? 'Save Event'
                      : 'Re-upload Media',
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
