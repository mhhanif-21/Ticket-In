import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../utils/form_field_contract.dart';

class _AddFieldDialog extends StatefulWidget {
  const _AddFieldDialog({
    required this.type,
    required this.title,
    required this.validateName,
  });

  final String type;
  final String title;
  final String? Function(String name) validateName;

  @override
  State<_AddFieldDialog> createState() => _AddFieldDialogState();
}

class _AddFieldDialogState extends State<_AddFieldDialog> {
  late final TextEditingController _nameController;
  late final List<TextEditingController> _optionControllers;
  final List<TextEditingController> _retiredOptionControllers = [];

  bool get _needsOptions =>
      ['radio', 'checkbox', 'select'].contains(widget.type);

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _optionControllers = _needsOptions
        ? [TextEditingController(), TextEditingController()]
        : [];
  }

  @override
  void dispose() {
    _nameController.dispose();
    for (final controller in [
      ..._optionControllers,
      ..._retiredOptionControllers,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _showValidationMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _submit() {
    final name = _nameController.text.trim();
    final nameError = widget.validateName(name);
    if (nameError != null) {
      _showValidationMessage(nameError);
      return;
    }

    final validOptions = _optionControllers
        .map((controller) => controller.text.trim())
        .where((text) => text.isNotEmpty)
        .toList();
    if (_needsOptions && validOptions.length < 2) {
      _showValidationMessage('Minimal 2 opsi jawaban harus diisi');
      return;
    }

    Navigator.pop(context, {
      'name': name,
      'options': _needsOptions ? validOptions : null,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        _needsOptions ? 'Pertanyaan: ${widget.title}' : 'Pertanyaan Baru',
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: 'Judul Pertanyaan',
                hintText: 'Contoh: Jenis Kelamin',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
              ),
              autofocus: true,
            ),
            if (_needsOptions) ...[
              const SizedBox(height: 16),
              const Text(
                'Opsi Jawaban',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF444748),
                ),
              ),
              const SizedBox(height: 8),
              ..._optionControllers.asMap().entries.map((entry) {
                final index = entry.key;
                final controller = entry.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: controller,
                          decoration: InputDecoration(
                            labelText: 'Opsi ${index + 1}',
                            hintText: 'Isi opsi jawaban...',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                          ),
                        ),
                      ),
                      if (_optionControllers.length > 2)
                        IconButton(
                          icon: const Icon(
                            Icons.remove_circle_outline,
                            color: Color(0xFFBA1A1A),
                            size: 20,
                          ),
                          onPressed: () {
                            setState(() {
                              _retiredOptionControllers.add(
                                _optionControllers.removeAt(index),
                              );
                            });
                          },
                        ),
                    ],
                  ),
                );
              }),
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _optionControllers.add(TextEditingController());
                  });
                },
                icon: const Icon(Icons.add, size: 18, color: Color(0xFF000000)),
                label: const Text(
                  'Tambah Opsi',
                  style: TextStyle(
                    color: Color(0xFF000000),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text(
            'Batal',
            style: TextStyle(color: Color(0xFF444748)),
          ),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF000000),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          onPressed: _submit,
          child: const Text('Tambah'),
        ),
      ],
    );
  }
}

class FormBuilderScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;
  // [BUG-054] Flag untuk tahu apakah ini pertama kali dari create event
  final bool isFirstSetup;

  const FormBuilderScreen({
    Key? key,
    required this.eventId,
    this.eventService,
    this.isFirstSetup = false,
  }) : super(key: key);

  @override
  _FormBuilderScreenState createState() => _FormBuilderScreenState();
}

class _FormBuilderScreenState extends State<FormBuilderScreen> {
  late final EventService _eventService;
  bool _isLoading = true;
  List<FormFieldModel> _fields = [];

  // [BUG-054] Field default yang terkunci (tidak bisa dihapus)
  List<FormFieldModel> _lockedFields = [
    FormFieldModel(
      fieldKind: 'static_name',
      fieldName: 'Nama',
      fieldType: 'text',
      isRequired: true,
      order: 0,
    ),
    FormFieldModel(
      fieldKind: 'static_email',
      fieldName: 'Email',
      fieldType: 'email',
      isRequired: true,
      order: 1,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _loadFields();
  }

  Future<void> _loadFields() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      if (!mounted) return;
      FormFieldModel staticField(
        String kind,
        String label,
        String type,
        int order,
      ) {
        for (final field in event.formFields) {
          if (field.fieldKind == kind ||
              (staticFormFieldKindFor(field.fieldName) == kind)) {
            return field.copyWith(
              fieldKind: kind,
              fieldName: label,
              fieldType: type,
              isRequired: true,
              order: order,
            );
          }
        }
        return FormFieldModel(
          fieldKind: kind,
          fieldName: label,
          fieldType: type,
          isRequired: true,
          order: order,
        );
      }

      final existingCustomFields = event.formFields
          .where(
            (field) => !isStaticFormField(
              label: field.fieldName,
              kind: field.fieldKind,
            ),
          )
          .toList();
      setState(() {
        _lockedFields = [
          staticField('static_name', 'Nama', 'text', 0),
          staticField('static_email', 'Email', 'email', 1),
        ];
        _fields = existingCustomFields;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Gagal memuat form: $e')));
      Navigator.pop(context);
    }
  }

  // [BUG-056] FIX: isScrollControlled: true + DraggableScrollableSheet menghindari overflow
  Future<void> _showAddFieldSheet() async {
    if (_fields.length >= 23) {
      // 25 max - 2 locked fields
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maksimal 23 field kustom diperbolehkan')),
      );
      return;
    }

    final selectedType = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      // [BUG-056] FIX: isScrollControlled agar Bottom Sheet bisa scroll dan tidak overflow
      isScrollControlled: true,
      builder: (context) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          // [BUG-056] FIX: Batasi tinggi max dengan SafeArea + padding keyboard
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(
                width: 48,
                height: 6,
                decoration: BoxDecoration(
                  color: const Color(0xFFC4C7C7),
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
                        color: Color(0xFF1A1C1C),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Color(0xFF444748)),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              // [BUG-056] FIX: Scrollable grid agar tidak overflow
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 1.5,
                    children: [
                      _buildFieldTypeBtn(
                        'text',
                        'Teks Singkat',
                        Icons.short_text,
                      ),
                      _buildFieldTypeBtn(
                        'textarea',
                        'Teks Panjang',
                        Icons.notes,
                      ),
                      _buildFieldTypeBtn('number', 'Angka', Icons.numbers),
                      _buildFieldTypeBtn(
                        'radio',
                        'Pilihan Ganda',
                        Icons.radio_button_checked,
                      ),
                      _buildFieldTypeBtn(
                        'checkbox',
                        'Kotak Centang',
                        Icons.check_box,
                      ),
                      _buildFieldTypeBtn(
                        'select',
                        'Dropdown',
                        Icons.arrow_drop_down_circle,
                      ),
                      _buildFieldTypeBtn(
                        'file',
                        'Unggah Berkas',
                        Icons.upload_file,
                      ),
                      _buildFieldTypeBtn(
                        'image',
                        'Unggah Gambar',
                        Icons.image_outlined,
                      ),
                      _buildFieldTypeBtn(
                        'email',
                        'Email Tambahan',
                        Icons.alternate_email,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );

    if (!mounted || selectedType == null) return;
    await _addSpecificField(selectedType);
  }

  Widget _buildFieldTypeBtn(String type, String label, IconData icon) {
    return InkWell(
      onTap: () {
        // Return the selection first. The caller waits for the sheet route to
        // finish deactivation before opening the field dialog.
        Navigator.pop(context, type);
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFEEEEEE),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.transparent),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: const Color(0xFF000000), size: 32),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1A1C1C),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Keep field-dialog controllers owned by the dialog route. Disposing them in
  // this parent immediately after Navigator.pop races route deactivation.
  String? _validateCustomFieldName(String name) {
    if (name.isEmpty) return 'Judul pertanyaan tidak boleh kosong';
    if (staticFormFieldKindFor(name) != null) {
      return 'Nama dan Email adalah field sistem dan tidak dapat dibuat ulang.';
    }
    if (_fields.any(
      (field) =>
          normalizeFormFieldLabel(field.fieldName) ==
          normalizeFormFieldLabel(name),
    )) {
      return 'Nama field kustom tidak boleh duplikat.';
    }
    return null;
  }

  Future<void> _addSpecificField(String type) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _AddFieldDialog(
        type: type,
        title: _getTypeLabel(type),
        validateName: _validateCustomFieldName,
      ),
    );

    if (!mounted || result == null) return;
    setState(() {
      _fields.add(
        FormFieldModel(
          fieldKind: 'custom',
          fieldName: result['name'] as String,
          fieldType: type,
          isRequired: false,
          options: result['options'] as List<String>?,
          order: _fields.length + 2, // +2 karena 2 locked fields di awal
        ),
      );
    });
  }

  String _getTypeLabel(String type) {
    switch (type) {
      case 'radio':
        return 'Pilihan Ganda';
      case 'checkbox':
        return 'Kotak Centang';
      case 'select':
        return 'Dropdown';
      case 'textarea':
        return 'Teks Panjang';
      case 'number':
        return 'Angka';
      case 'file':
        return 'Unggah Berkas';
      case 'image':
        return 'Unggah Gambar';
      case 'email':
        return 'Email Tambahan';
      default:
        return 'Teks Singkat';
    }
  }

  Future<void> _saveFields() async {
    setState(() => _isLoading = true);
    try {
      // [BUG-054] FIX: Gabungkan locked fields + custom fields saat simpan
      final allFields = [
        ..._lockedFields.asMap().entries.map(
          (entry) => entry.value.copyWith(order: entry.key),
        ),
        ..._fields.asMap().entries.map((e) {
          return e.value.copyWith(
            fieldKind: 'custom',
            order: e.key + 2, // +2 karena 2 locked fields di urutan 0 & 1
          );
        }),
      ];

      await _eventService.saveFormFields(widget.eventId, allFields);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Form berhasil disimpan! Sekarang simpan konfigurasi tiket.',
          ),
        ),
      );

      // First setup must persist the ticket configuration before asking for a
      // publication decision. Access controls stay unavailable while Draft.
      if (widget.isFirstSetup) {
        context.pushReplacement(
          '/ticket-template/${widget.eventId}',
          extra: 'first_setup',
        );
      } else {
        Navigator.pop(context);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFFF9F9F9);
    const primaryColor = Color(0xFF000000);
    const lockedBg = Color(0xFFF3F3F3);
    const lockedBorder = Color(0xFFC4C7C7);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFF9F9F9),
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: primaryColor),
        title: const Text(
          'Susun Form Pendaftaran',
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
          : CustomScrollView(
              slivers: [
                // [BUG-054] Banner info alur
                if (widget.isFirstSetup)
                  SliverToBoxAdapter(
                    child: Container(
                      margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: primaryColor.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: primaryColor.withOpacity(0.2),
                        ),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            color: Color(0xFF000000),
                            size: 18,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Susun form pendaftaran acara Anda. Field Nama & Email sudah otomatis terkunci.',
                              style: TextStyle(
                                fontSize: 12,
                                color: Color(0xFF000000),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                // [BUG-054] Section: Field terkunci (Nama & Email)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.lock,
                          size: 14,
                          color: Color(0xFF747878),
                        ),
                        const SizedBox(width: 6),
                        const Text(
                          'Field Wajib (Tidak dapat dihapus)',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF747878),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverList(
                  delegate: SliverChildListDelegate(
                    _lockedFields
                        .map(
                          (field) => _buildLockedFieldCard(
                            field,
                            lockedBg,
                            lockedBorder,
                          ),
                        )
                        .toList(),
                  ),
                ),

                // Section: Field kustom (bisa drag & hapus)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.tune,
                          size: 14,
                          color: Color(0xFF444748),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Field Kustom (${_fields.length} / 23)',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF444748),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Reorderable custom fields
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                  sliver: _fields.isEmpty
                      ? SliverToBoxAdapter(
                          child: Container(
                            padding: const EdgeInsets.all(32),
                            alignment: Alignment.center,
                            child: Column(
                              children: [
                                Icon(
                                  Icons.add_circle_outline,
                                  size: 48,
                                  color: Colors.grey.shade300,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Belum ada field kustom.\nTekan tombol + untuk menambah.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.grey.shade500,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : SliverList(
                          delegate: SliverChildBuilderDelegate((
                            context,
                            index,
                          ) {
                            final field = _fields[index];
                            return _buildCustomFieldCard(field, index);
                          }, childCount: _fields.length),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddFieldSheet,
        backgroundColor: const Color(0xFF000000),
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
      // [MOB-BUG-012] FIX: Container di luar SafeArea agar warna solid sampai tepi layar
      bottomNavigationBar: Container(
        key: const ValueKey('form-builder-bottom-action'),
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
                onPressed: _isLoading ? null : _saveFields,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: primaryColor.withOpacity(0.35),
                  disabledForegroundColor: Colors.white70,
                  elevation: 0,
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(72, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        'Simpan',
                        style: TextStyle(
                          fontSize: 14,
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

  Widget _buildLockedFieldCard(
    FormFieldModel field,
    Color bgColor,
    Color borderColor,
  ) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border.all(color: borderColor, width: 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock_outline, color: Color(0xFF747878), size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  field.fieldName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1A1C1C),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _buildBadge(
                      field.fieldType.toUpperCase(),
                      const Color(0xFF444748),
                      const Color(0xFFC4C7C7),
                    ),
                    const SizedBox(width: 6),
                    _buildBadge(
                      'WAJIB',
                      const Color(0xFFBA1A1A),
                      const Color(0xFFFFDAD6),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomFieldCard(FormFieldModel field, int index) {
    return Container(
      key: ValueKey(field.fieldName + index.toString() + field.fieldType),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFC4C7C7), width: 1.5),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 2.0),
              child: Icon(Icons.drag_indicator, color: Color(0xFFC4C7C7)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    field.fieldName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1A1C1C),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _buildBadge(
                        field.fieldType.toUpperCase(),
                        const Color(0xFF444748),
                        const Color(0xFFC4C7C7),
                      ),
                      if (field.isRequired) ...[
                        const SizedBox(width: 6),
                        _buildBadge(
                          'WAJIB',
                          const Color(0xFFBA1A1A),
                          const Color(0xFFFFDAD6),
                        ),
                      ],
                    ],
                  ),
                  // Tampilkan preview opsi jika ada
                  if (field.options != null && field.options!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      field.options!.take(3).join(' • ') +
                          (field.options!.length > 3
                              ? ' +${field.options!.length - 3} lagi'
                              : ''),
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF747878),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Toggle wajib/opsional
            GestureDetector(
              onTap: () {
                setState(() {
                  _fields[index] = FormFieldModel(
                    id: field.id,
                    fieldKey: field.fieldKey,
                    fieldKind: field.fieldKind,
                    fieldName: field.fieldName,
                    fieldType: field.fieldType,
                    isRequired: !field.isRequired,
                    options: field.options,
                    order: field.order,
                  );
                });
              },
              child: Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Icon(
                  field.isRequired ? Icons.toggle_on : Icons.toggle_off,
                  color: field.isRequired
                      ? const Color(0xFF000000)
                      : const Color(0xFFC4C7C7),
                  size: 28,
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Color(0xFFBA1A1A)),
              onPressed: () => setState(() => _fields.removeAt(index)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBadge(String text, Color textColor, Color bgColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: textColor.withOpacity(0.15)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: textColor,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
