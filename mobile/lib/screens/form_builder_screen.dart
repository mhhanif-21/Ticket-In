import 'package:flutter/material.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';

class FormBuilderScreen extends StatefulWidget {
  final String eventId;

  const FormBuilderScreen({Key? key, required this.eventId}) : super(key: key);

  @override
  _FormBuilderScreenState createState() => _FormBuilderScreenState();
}

class _FormBuilderScreenState extends State<FormBuilderScreen> {
  final EventService _eventService = EventService();
  bool _isLoading = true;
  List<FormFieldModel> _fields = [];

  @override
  void initState() {
    super.initState();
    _loadFields();
  }

  Future<void> _loadFields() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      setState(() {
        _fields = List.from(event.formFields);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal memuat form: $e')));
      Navigator.pop(context);
    }
  }

  void _showAddFieldSheet() {
    if (_fields.length >= 25) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Maksimal 25 field diperbolehkan')));
      return;
    }
    
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(
                width: 48,
                height: 6,
                decoration: BoxDecoration(
                  color: const Color(0xFFC1C8C0),
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Pilih Tipe Pertanyaan',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1A1C1A),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Color(0xFF424842)),
                      onPressed: () => Navigator.pop(context),
                    )
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                  childAspectRatio: 1.5,
                  children: [
                    _buildFieldTypeBtn('text', 'Teks Singkat', Icons.short_text),
                    _buildFieldTypeBtn('textarea', 'Teks Panjang', Icons.notes),
                    _buildFieldTypeBtn('number', 'Angka', Icons.numbers),
                    _buildFieldTypeBtn('radio', 'Pilihan Ganda', Icons.radio_button_checked),
                    _buildFieldTypeBtn('checkbox', 'Kotak Centang', Icons.check_box),
                    _buildFieldTypeBtn('select', 'Dropdown', Icons.arrow_drop_down_circle),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFieldTypeBtn(String type, String label, IconData icon) {
    return InkWell(
      onTap: () {
        Navigator.pop(context);
        _addSpecificField(type);
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFEEEEEA),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.transparent),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: const Color(0xFF41674B), size: 32),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFF1A1C1A)),
            ),
          ],
        ),
      ),
    );
  }

  void _addSpecificField(String type) {
    // Basic implementation for adding field. In a full app, this would open a dialog to name the field first.
    // For now, we simulate adding a field directly.
    setState(() {
      _fields.add(FormFieldModel(
        fieldName: 'Pertanyaan Baru',
        fieldType: type,
        isRequired: false,
        order: _fields.length,
      ));
    });
  }

  Future<void> _saveFields() async {
    setState(() => _isLoading = true);
    try {
      final updatedFields = _fields.asMap().entries.map((e) {
        return FormFieldModel(
          fieldName: e.value.fieldName,
          fieldType: e.value.fieldType,
          isRequired: e.value.isRequired,
          options: e.value.options,
          order: e.key,
        );
      }).toList();

      await _eventService.saveFormFields(widget.eventId, updatedFields);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Form berhasil disimpan!')));
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFFF9FAF5);
    const primaryColor = Color(0xFF41674B);
    
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFF9FAF5),
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: primaryColor),
        title: const Text(
          'Susun Form Pendaftaran',
          style: TextStyle(
            color: Color(0xFF1A1C1A),
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          TextButton(
            onPressed: _isLoading ? null : _saveFields,
            child: const Text(
              'Simpan',
              style: TextStyle(
                color: primaryColor,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
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
          : ReorderableListView.builder(
              padding: const EdgeInsets.all(20),
              itemCount: _fields.length,
              itemBuilder: (context, index) {
                final field = _fields[index];
                return Container(
                  key: ValueKey(field.fieldName + index.toString() + field.fieldType),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFFFF),
                    border: Border.all(color: const Color(0xFFC1C8C0)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    leading: const Icon(Icons.drag_indicator, color: Color(0xFF424842)),
                    title: Text(
                      field.fieldName,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF1A1C1A),
                      ),
                    ),
                    subtitle: Text(
                      'Tipe: ${field.fieldType} | Wajib: ${field.isRequired ? "Ya" : "Tidak"}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF424842),
                      ),
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete, color: Color(0xFFBA1A1A)),
                      onPressed: () {
                        setState(() {
                          _fields.removeAt(index);
                        });
                      },
                    ),
                  ),
                );
              },
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex -= 1;
                  final item = _fields.removeAt(oldIndex);
                  _fields.insert(newIndex, item);
                });
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddFieldSheet,
        backgroundColor: const Color(0xFF7EA687),
        foregroundColor: const Color(0xFF163B24),
        child: const Icon(Icons.add),
      ),
    );
  }
}
