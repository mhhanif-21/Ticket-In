import 'package:flutter/material.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../services/poster_validation.dart';
import '../widgets/adaptive_event_image.dart';

class _EditableMediaItem {
  const _EditableMediaItem.remote(this.remote) : file = null;

  const _EditableMediaItem.local(this.file) : remote = null;

  final EventMediaModel? remote;
  final File? file;

  bool get isLocal => file != null;
  String get id => remote?.id ?? '';
  String get localIdentity => file?.absolute.path ?? '';
  ImageProvider get image =>
      file == null ? NetworkImage(remote!.publicUrl) : FileImage(file!);
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
  final PageController _mediaPageController = PageController();

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _locationController = TextEditingController();
  final TextEditingController _capacityController = TextEditingController();
  final TextEditingController _dateController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();

  DateTime? _selectedDate;
  String _selectedMode = 'Auto-Accept';
  bool _isLoading = true;
  final List<_EditableMediaItem> _mediaItems = [];
  bool _mediaChanged = false;
  bool _coverPending = false;
  int _activeMediaIndex = 0;

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
        _nameController.text = event.name;
        _locationController.text = event.location;
        _capacityController.text = event.capacity.toString();
        _descriptionController.text = event.description ?? '';
        _selectedDate = event.date;
        _dateController.text = DateFormat('dd MMM yyyy').format(event.date);
        _selectedMode = event.registrationMode;
        _mediaItems
          ..clear()
          ..addAll(_mediaItemsForEvent(event));
        _mediaChanged = _mediaItems.isNotEmpty &&
            _mediaItems.first.remote?.role != 'cover';
        _coverPending = false;
        _activeMediaIndex = 0;
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

  List<_EditableMediaItem> _mediaItemsForEvent(EventModel event) {
    final items = <_EditableMediaItem>[];
    final posterUrl = event.posterUrl?.trim();
    EventMediaModel? persistedCover;
    for (final media in event.media) {
      if (media.role == 'cover' &&
          media.displayOrder == 0 &&
          media.publicUrl.trim().isNotEmpty) {
        persistedCover = media;
        break;
      }
    }

    if (persistedCover != null) {
      items.add(_EditableMediaItem.remote(persistedCover));
    } else if (posterUrl != null && posterUrl.isNotEmpty) {
      items.add(
        _EditableMediaItem.remote(
          EventMediaModel(
            id: 'legacy-cover',
            role: 'cover',
            displayOrder: 0,
            publicUrl: posterUrl,
          ),
        ),
      );
    }

    final media = event.media
            .where((item) => item.publicUrl.trim().isNotEmpty)
            .where((item) => item.id != persistedCover?.id)
            .where((item) => item.role != 'cover')
            .toList()
          ..sort((left, right) {
            final roleOrder = left.role == 'cover' ? -1 : 0;
            final rightRoleOrder = right.role == 'cover' ? -1 : 0;
            return roleOrder != rightRoleOrder
                ? roleOrder.compareTo(rightRoleOrder)
                : left.displayOrder.compareTo(right.displayOrder);
          });
    items.addAll(media.map(_EditableMediaItem.remote));
    return items;
  }

  Future<List<File>> _pickPosterFiles() async {
    if (widget.galleryPicker != null) {
      return widget.galleryPicker!();
    }
    if (widget.posterPicker != null) {
      final file = await widget.posterPicker!();
      return file == null ? const [] : [file];
    }
    final picked = await ImagePicker().pickMultiImage();
    return picked.map((item) => File(item.path)).toList();
  }

  Future<void> _pickPosterImages() async {
    List<File> pickedFiles;
    pickedFiles = await _pickPosterFiles();
    if (!mounted || pickedFiles.isEmpty) return;

    final existing = _mediaItems
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
        const SnackBar(content: Text('Foto yang dipilih sudah ada.')),
      );
      return;
    }
    final remainingSlots = maxEventPosterImages - _mediaItems.length;
    if (additions.length > remainingSlots) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Maksimal $maxEventPosterImages poster. Sisa slot: $remainingSlots.',
          ),
        ),
      );
      return;
    }
    setState(() {
      final wasEmpty = _mediaItems.isEmpty;
      _mediaItems.addAll(additions.map(_EditableMediaItem.local));
      _mediaChanged = true;
      _coverPending = _coverPending || wasEmpty;
      _activeMediaIndex = _mediaItems.length - additions.length;
    });
    _moveToMediaPage(_activeMediaIndex);
  }

  void _removeMediaAt(int index) {
    if (index < 0 || index >= _mediaItems.length) return;
    setState(() {
      _mediaItems.removeAt(index);
      _mediaChanged = true;
      _coverPending = _mediaItems.isNotEmpty && _mediaItems.first.isLocal;
      if (_mediaItems.isEmpty) {
        _activeMediaIndex = 0;
      } else {
        if (_activeMediaIndex > index) _activeMediaIndex -= 1;
        _activeMediaIndex = _activeMediaIndex.clamp(
          0,
          _mediaItems.length - 1,
        );
      }
    });
    _moveToMediaPage(_activeMediaIndex);
  }

  void _moveToMediaPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_mediaPageController.hasClients || _mediaItems.isEmpty) {
        return;
      }
      _mediaPageController.animateToPage(
        index.clamp(0, _mediaItems.length - 1),
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
    if (_mediaItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Minimal satu poster acara harus dipilih.')),
      );
      return;
    }
    if (_mediaItems.length > maxEventPosterImages) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Maksimal $maxEventPosterImages poster acara. Hapus poster tambahan sebelum menyimpan.',
          ),
        ),
      );
      return;
    }
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
          action: metadataPersisted && (_coverPending || _mediaChanged)
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
    if (_mediaItems.isEmpty) {
      throw const EventMediaUploadException(
        'Minimal satu poster acara harus dipilih sebelum menyimpan.',
      );
    }

    final firstItem = _mediaItems.first;
    if (_coverPending && firstItem.isLocal) {
      await _eventService.uploadEventPoster(
        widget.eventId,
        firstItem.file!.path,
      );
      // The cover upload is acknowledged by the server. Keep the local file
      // in the collection until the final read-back, but do not upload it
      // again when a later gallery step needs a retry.
      _coverPending = false;
    }

    if (!_mediaChanged && !_coverPending) return;

    if (!firstItem.isLocal && firstItem.remote!.role != 'cover') {
      await _eventService.promoteEventMedia(widget.eventId, firstItem.id);
    }

    // The API still stores the first item as cover and subsequent items as
    // gallery rows. The editor itself has only one media collection.
    final remoteGalleryIds = _mediaItems
        .skip(1)
        .where((item) => !item.isLocal)
        .map((item) => item.id)
        .toList();
    if (remoteGalleryIds.any((id) => id.isEmpty)) {
      throw const EventMediaUploadException(
        'Poster tambahan belum siap diperbarui. Silakan coba lagi.',
      );
    }

    // Remove/reorder stale server rows before appending local files. This is
    // important when the collection is already full: the server must see the
    // deletion before it evaluates the new-file capacity.
    await _eventService.replaceEventGallery(
      widget.eventId,
      remoteGalleryIds,
    );

    final localItems = _mediaItems
        .skip(1)
        .where((item) => item.isLocal)
        .toList();
    if (localItems.isNotEmpty) {
      // Upload each pending item independently. A successful response is
      // immediately replaced by its server row, so a later retry contains
      // only the item(s) that still need uploading.
      var failedCount = 0;
      for (final localItem in localItems) {
        try {
          final added = await _eventService.appendEventGallery(
            widget.eventId,
            [localItem.file!.path],
          );
          EventMediaModel? uploadedItem;
          if (added.length == 1 && added.first.id.isNotEmpty) {
            uploadedItem = added.first;
          } else if (added.isEmpty) {
            // Some successful 2xx responses do not include the created row.
            // Confirm the acknowledgement from the event detail before
            // classifying the item as failed.
            try {
              final refreshed = await _eventService.getEventDetail(
                widget.eventId,
              );
              final knownIds = _mediaItems
                  .where((item) => !item.isLocal && item.id.isNotEmpty)
                  .map((item) => item.id)
                  .toSet();
              final candidates = _mediaItemsForEvent(refreshed)
                  .where((item) => item.remote?.role != 'cover')
                  .where((item) => !knownIds.contains(item.id))
                  .toList();
              if (candidates.length == 1) {
                uploadedItem = candidates.single.remote;
              }
            } catch (_) {
              // Read-back failure remains retryable and must keep this local
              // file in the editor state.
            }
          }
          if (uploadedItem == null) {
            failedCount += 1;
            continue;
          }
          final itemIndex = _mediaItems.indexOf(localItem);
          if (itemIndex >= 0) {
            final serverItem = _EditableMediaItem.remote(uploadedItem);
            if (mounted) {
              setState(() => _mediaItems[itemIndex] = serverItem);
            } else {
              _mediaItems[itemIndex] = serverItem;
            }
          }
        } catch (_) {
          failedCount += 1;
        }
      }
      if (failedCount > 0) {
        throw const EventMediaUploadException(
          'Sebagian foto galeri belum dapat diproses. Silakan unggah ulang foto yang gagal.',
        );
      }
    }

    final galleryIds = _mediaItems.skip(1).map((item) => item.id).toList();
    if (galleryIds.any((id) => id.isEmpty)) {
      throw const EventMediaUploadException(
        'Poster tambahan belum siap diperbarui. Silakan coba lagi.',
      );
    }
    await _eventService.replaceEventGallery(widget.eventId, galleryIds);
    await _refreshMediaFromServer();
  }

  Future<void> _refreshMediaFromServer() async {
    final expectedItems = List<_EditableMediaItem>.of(_mediaItems);
    final expectedRemoteIds = expectedItems
        .where((item) => !item.isLocal && item.id != 'legacy-cover')
        .map((item) => item.id)
        .where((id) => id.isNotEmpty)
        .toSet();
    late final EventModel event;
    try {
      event = await _eventService.getEventDetail(widget.eventId);
    } catch (_) {
      throw const EventMediaUploadException(
        'Media sudah dikirim, tetapi status terbaru belum dapat dimuat. Silakan coba lagi.',
      );
    }

    final serverItems = _mediaItemsForEvent(event);
    final serverIds = serverItems.map((item) => item.id).toSet();
    if (serverItems.length != expectedItems.length ||
        !expectedRemoteIds.every(serverIds.contains)) {
      throw const EventMediaUploadException(
        'Media sudah dikirim, tetapi belum dapat dikonfirmasi dari server. Silakan coba lagi.',
      );
    }
    if (!mounted) return;
    setState(() {
      _mediaItems
        ..clear()
        ..addAll(serverItems);
      _activeMediaIndex = _activeMediaIndex.clamp(0, _mediaItems.length - 1);
      _mediaChanged = false;
      _coverPending = false;
    });
    _moveToMediaPage(_activeMediaIndex);
  }

  @override
  void dispose() {
    _mediaPageController.dispose();
    _nameController.dispose();
    _locationController.dispose();
    _capacityController.dispose();
    _dateController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Widget _buildMediaPlaceholder() {
    return Container(
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
            color: Color(0xFFE5E2E1),
          ),
          SizedBox(height: 8),
          Text(
            'Belum ada poster acara',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Color(0xFF444748),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaSection() {
    final count = _mediaItems.length;
    final pageCount = count == 0 ? 1 : count;
    return Column(
      key: const ValueKey('edit-poster-picker'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Poster Acara ($count/$maxEventPosterImages)',
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1A1C1C),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Satu koleksi gambar · maksimal 5 poster. Poster pertama menjadi poster utama.',
          style: TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const ValueKey('edit-poster-upload'),
          onPressed: count >= maxEventPosterImages ? null : _pickPosterImages,
          icon: const Icon(Icons.add_photo_alternate_outlined),
          label: Text(count == 0 ? 'Pilih Poster' : 'Tambah Poster'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          key: const ValueKey('edit-poster-preview'),
          height: 260,
          child: PageView.builder(
            controller: _mediaPageController,
            itemCount: pageCount,
            onPageChanged: (index) {
              if (mounted) setState(() => _activeMediaIndex = index);
            },
            itemBuilder: (context, index) {
              final item = count == 0 ? null : _mediaItems[index];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    item == null
                        ? _buildMediaPlaceholder()
                        : AdaptiveEventImage(
                            image: item.image,
                            frameAspectRatio: 4 / 3,
                            expand: true,
                            blurredBackdrop: false,
                            backgroundColor: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                          ),
                    if (item != null)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: IconButton.filledTonal(
                          key: ValueKey('edit-poster-remove-$index'),
                          tooltip: 'Hapus poster ${index + 1}',
                          onPressed: () => _removeMediaAt(index),
                          icon: const Icon(Icons.close),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
        if (count > 1) ...[
          const SizedBox(height: 4),
          SizedBox(
            height: 56,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: count,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final selected = index == _activeMediaIndex;
                return InkWell(
                  onTap: () {
                    setState(() => _activeMediaIndex = index);
                    _moveToMediaPage(index);
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
                      image: _mediaItems[index].image,
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
        ],
        const SizedBox(height: 4),
        Text(
          count == 0
              ? 'Poster belum dipilih.'
              : 'Poster terpilih ($count/$maxEventPosterImages).',
          style: const TextStyle(fontSize: 12, color: Color(0xFF5F6368)),
        ),
        if (count > maxEventPosterImages) ...[
          const SizedBox(height: 4),
          const Text(
            'Koleksi lama melebihi batas baru. Hapus poster tambahan sebelum menyimpan.',
            style: TextStyle(color: Color(0xFFBA1A1A), fontSize: 12),
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
                    _buildMediaSection(),
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
