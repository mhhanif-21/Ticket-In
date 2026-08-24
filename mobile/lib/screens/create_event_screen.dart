import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../services/event_service.dart';
import '../widgets/dashed_border_painter.dart';

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
  String _registrationMode = 'Auto-Accept';

  // [MOB-BUG-005] FIX: Dispose controllers untuk mencegah memory leak
  @override
  void dispose() {
    _nameController.dispose();
    _locationController.dispose();
    _capacityController.dispose();
    _descriptionController.dispose();
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
      // Client-Side Validation using Magic Bytes
      final file = File(picked.path);
      final raf = file.openSync();
      final bytes = raf.readSync(8);
      raf.closeSync();

      bool isValid = false;
      if (bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) {
        isValid = true; // JPEG
      } else if (bytes.length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
        isValid = true; // PNG
      }

      if (!isValid) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Format file tidak valid, hanya menerima gambar JPG/PNG')));
        return;
      }

      setState(() {
        _posterFile = file;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pilih tanggal acara')));
      return;
    }
    if (_posterFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Poster acara wajib diunggah')));
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

      final eventId = await _eventService.createEvent(data, posterPath: _posterFile?.path);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Acara berhasil dibuat! Sekarang susun form pendaftaran.')));
      // [BUG-054] FIX: Redirect ke /form-builder dulu, bukan langsung /access-management
      // Alur yang benar: Buat Acara → Form Builder → Kelola Akses
      // extra: 'first_setup' memberi tahu FormBuilderScreen untuk redirect ke access-management setelah simpan
      context.pushReplacement('/form-builder/$eventId', extra: 'first_setup');
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
            prefixIcon: icon != null ? Icon(icon, color: const Color(0xFFC4C7C7)) : null,
            filled: true,
            fillColor: const Color(0xFFFFFFFF),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
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
          'Buat Acara Baru',
          style: TextStyle(
            color: Color(0xFF1A1C1C),
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(
            color: const Color(0xFFC4C7C7),
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
                  // Image Upload Section
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
                                      color: Color(0xFF444748),
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
                    hint: '100',
                    icon: Icons.group,
                    keyboardType: TextInputType.number,
                    controller: _capacityController,
                    // [BUG-066] FIX: Validasi harus angka positif, bukan hanya tidak kosong
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
                            color: Color(0xFF444748),
                          ),
                        ),
                      ),
                      DropdownButtonFormField<String>(
                        value: _registrationMode,
                        items: ['Auto-Accept', 'Manual Review'].map((mode) => DropdownMenuItem(value: mode, child: Text(mode, style: const TextStyle(fontSize: 14)))).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _registrationMode = val);
                          }
                        },
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: const Color(0xFFFFFFFF),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFC4C7C7)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF000000)),
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
                onPressed: _isLoading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
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
        ),
      ),
    );
  }
}
