const supportedCustomFieldTypes = <String>{
  'text',
  'textarea',
  'number',
  'select',
  'checkbox',
  'radio',
  'file',
  'image',
  'email',
};

String normalizeFormFieldLabel(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), '').toLowerCase();

String? staticFormFieldKindFor(String label) {
  switch (normalizeFormFieldLabel(label)) {
    case 'nama':
      return 'static_name';
    case 'email':
      return 'static_email';
    default:
      return null;
  }
}

bool isStaticFormField({required String label, String? kind}) =>
    kind == 'static_name' ||
    kind == 'static_email' ||
    staticFormFieldKindFor(label) != null;
