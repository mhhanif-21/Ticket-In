import 'package:flutter/material.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../services/poster_validation.dart';
import '../widgets/dashed_border_painter.dart';

class EditEventScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;
  final Future<File?> Function()? posterPicker;

  const EditEventScreen({Key? key, required this.eventId, this.eventService, this.posterPicker}) : super(key: key);

  @override
  _EditEventScreenState createState() => _EditEventScreenState();
}

class _EditEventScreenState extends State<EditEventScreen> {
  final _formKey = GlobalKey<FormState>();
  late final EventService _eventService;

  late TextEditingController _nameController;
  late TextEditingController _locationController;
  late TextEditingController _capacityController;
  final TextEditingController _descriptionController = TextEditingController();
  
  DateTime? _selectedDate;
  String _selectedMode = 'Auto-Accept';
  bool _isLoading = true;
  EventModel? _event;
  File? _posterFile;

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _loadEvent();
  }

  Future<void> _loadEvent() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      setState(() {
        _event = event;
        _nameController = TextEditingController(text: event.name);
        _locationController = TextEditingController(text: event.location);
        _capacityController = TextEditingController(text: event.capacity.toString());
        _descriptionController.text = event.description ?? '';
        _selectedDate = event.date;
        _selectedMode = event.registrationMode;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal memuat acara: $e')));
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
    if (pickedFile == null) return;

    if (!await hasSupportedPosterSignature(pickedFile)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Format file tidak valid, hanya menerima gambar JPG/PNG')));
      }
      return;
    }

    setState(() => _posterFile = pickedFile);
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
              primary: Color(0xFF41674B),
              onPrimary: Colors.white,
              onSurface: Color(0xFF1A1C1A),
            ),
          ),
          child: child!,
        );
      },
    );
    if (date != null) {
      setState(() {
        _selectedDate = date;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

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
      if (_posterFile != null) {
        await _eventService.uploadEventPoster(widget.eventId, _posterFile!.path);
      }
      
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Acara berhasil diperbarui!')));
      Navigator.pop(context, true); // Return true to signal refresh
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _locationController.dispose();
    _capacityController.dispose();
    _descriptionController.dispose();
    super.dispose();
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
              color: Color(0xFF424842),
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
          style: const TextStyle(fontSize: 14, color: Color(0xFF1A1C1A)),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Color(0xFFC1C8C0), fontSize: 14),
            prefixIcon: icon != null ? Icon(icon, color: const Color(0xFFC1C8C0)) : null,
            filled: true,
            fillColor: const Color(0xFFFFFFFF),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFDFE3DE)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF7EA687)),
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
    const bgColor = Color(0xFFF3F5F2);
    const primaryColor = Color(0xFF41674B);
    const primaryContainerColor = Color(0xFF7EA687);
    const onPrimaryContainerColor = Color(0xFF163B24);
    
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFF9FAF5),
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Color(0xFF424842)),
        title: const Text(
          'Lihat/Edit Detail Acara',
          style: TextStyle(
            color: Color(0xFF1A1C1A),
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(
            color: const Color(0xFFC1C8C0),
            height: 1.0,
          ),
        ),
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator(color: primaryColor))
        : SingleChildScrollView(
            padding: const EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20),
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
                      child: Container(
                      width: double.infinity,
                      height: 180, // Aspect ratio approx 16:9
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: _posterFile != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(_posterFile!, fit: BoxFit.cover),
                            )
                          : _event?.posterUrl != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(_event!.posterUrl!, fit: BoxFit.cover),
                            )
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.add_photo_alternate, size: 40, color: primaryContainerColor),
                                const SizedBox(height: 8),
                                const Text(
                                  'Ubah Poster Acara (16:9)',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: Color(0xFF424842),
                                  ),
                                ),
                              ],
                            ),
                      ),
                    ),
                  ),
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
                      if (parsed == null) return 'Harus berupa angka (misal: 100)';
                      if (parsed <= 0) return 'Kuota harus lebih dari 0';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  
                  _buildTextField(
                    label: 'Tanggal',
                    hint: _selectedDate == null ? 'Pilih Tanggal Acara' : DateFormat('dd MMM yyyy').format(_selectedDate!),
                    icon: Icons.calendar_today,
                    controller: TextEditingController(text: _selectedDate == null ? '' : DateFormat('dd MMM yyyy').format(_selectedDate!)),
                    readOnly: true,
                    onTap: _pickDate,
                    validator: (v) => _selectedDate == null ? 'Harus diisi' : null,
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
                            color: Color(0xFF424842),
                          ),
                        ),
                      ),
                      DropdownButtonFormField<String>(
                        value: _selectedMode,
                        items: ['Auto-Accept', 'Manual Review'].map((mode) => DropdownMenuItem(value: mode, child: Text(mode, style: const TextStyle(fontSize: 14)))).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _selectedMode = val);
                          }
                        },
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: const Color(0xFFFFFFFF),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFDFE3DE)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF7EA687)),
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
      bottomNavigationBar: _isLoading ? null : Container(
        key: const ValueKey('edit-event-bottom-action'),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFC1C8C0))),
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
                  backgroundColor: primaryContainerColor,
                  foregroundColor: onPrimaryContainerColor,
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
