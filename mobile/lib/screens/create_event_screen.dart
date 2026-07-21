import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../services/event_service.dart';

class CreateEventScreen extends StatefulWidget {
  const CreateEventScreen({Key? key}) : super(key: key);

  @override
  _CreateEventScreenState createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends State<CreateEventScreen> {
  final _formKey = GlobalKey<FormState>();
  final EventService _eventService = EventService();

  final _nameController = TextEditingController();
  final _locationController = TextEditingController();
  final _capacityController = TextEditingController();
  final _descriptionController = TextEditingController(); // Added description
  
  DateTime? _selectedDate;
  File? _posterFile;
  bool _isLoading = false;

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
              primary: Color(0xFF41674B), // header background color
              onPrimary: Colors.white, // header text color
              onSurface: Color(0xFF1A1C1A), // body text color
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

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() {
        _posterFile = File(picked.path);
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pilih tanggal acara')));
      return;
    }

    setState(() => _isLoading = true);

    try {
      final data = {
        'name': _nameController.text,
        'location': _locationController.text,
        'capacity': _capacityController.text,
        'date': _selectedDate!.toIso8601String(),
        'registration_mode': 'Auto-Accept', // Default for now
      };

      await _eventService.createEvent(data, posterPath: _posterFile?.path);
      
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Acara berhasil dibuat!')));
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal membuat acara: $e')));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
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
          'Buat Acara Baru',
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
            padding: const EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 100),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Image Upload Section
                  GestureDetector(
                    onTap: _pickImage,
                    child: Container(
                      width: double.infinity,
                      height: 180, // Aspect ratio approx 16:9
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: primaryContainerColor,
                          width: 2,
                          style: BorderStyle.solid, // Flutter doesn't have dashed natively without packages, using solid
                        ),
                      ),
                      child: _posterFile != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(_posterFile!, fit: BoxFit.cover),
                            )
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.add_photo_alternate, size: 40, color: primaryContainerColor),
                                const SizedBox(height: 8),
                                const Text(
                                  'Unggah Poster Acara (16:9)',
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
                    validator: (v) => v!.isEmpty ? 'Harus diisi' : null,
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
                ],
              ),
            ),
          ),
      bottomSheet: Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFC1C8C0))),
        ),
        child: SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: primaryContainerColor,
              foregroundColor: onPrimaryContainerColor,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text(
              'Simpan Acara',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

