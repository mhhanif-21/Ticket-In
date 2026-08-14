class FormFieldModel {
  final String fieldName;
  final String fieldType;
  final bool isRequired;
  final List<String>? options;
  final int order;

  FormFieldModel({
    required this.fieldName,
    required this.fieldType,
    required this.isRequired,
    this.options,
    required this.order,
  });

  factory FormFieldModel.fromJson(Map<String, dynamic> json) {
    return FormFieldModel(
      fieldName: json['field_name'] ?? json['fieldName'] ?? '',
      fieldType: json['field_type'] ?? json['fieldType'] ?? 'text',
      isRequired: json['is_required'] ?? json['isRequired'] ?? false,
      options: json['options'] != null ? List<String>.from(json['options']) : null,
      order: json['order'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'field_name': fieldName,
      'field_type': fieldType,
      'is_required': isRequired,
      'options': options,
      'order': order,
    };
  }
}

class EventModel {
  final String id;
  final String name;
  final String slug;
  final int capacity;
  final String location;
  final String? description;
  final DateTime date;
  final String status;
  final String registrationMode;
  final String? posterUrl;
  final String? publicRegistrationUrl;
  final String? publicQrCodeUrl;
  final List<FormFieldModel> formFields;

  EventModel({
    required this.id,
    required this.name,
    required this.slug,
    required this.capacity,
    required this.location,
    this.description,
    required this.date,
    required this.status,
    required this.registrationMode,
    this.posterUrl,
    this.publicRegistrationUrl,
    this.publicQrCodeUrl,
    this.formFields = const [],
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    var formFieldsList = <FormFieldModel>[];
    // BUG-H FIX: Backend (Drizzle) mengembalikan 'formFields' (camelCase), bukan 'form_fields'
    final rawFields = json['form_fields'] ?? json['formFields'];
    if (rawFields != null) {
      formFieldsList = (rawFields as List)
          .map((e) => FormFieldModel.fromJson(e))
          .toList();
    }

    return EventModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      capacity: json['capacity'] ?? 0,
      location: json['location'] ?? '',
      description: json['description'],
      date: json['date'] != null ? DateTime.parse(json['date']) : DateTime.now(),
      status: json['status'] ?? 'Draft',
      registrationMode: json['registration_mode'] ?? json['registrationMode'] ?? 'Auto-Accept',
      posterUrl: json['poster_url'] ?? json['posterUrl'],
      publicRegistrationUrl: json['public_registration_url'],
      publicQrCodeUrl: json['public_qr_code_url'],
      formFields: formFieldsList,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'capacity': capacity,
      'location': location,
      'description': description,
      'date': date.toIso8601String(),
      'status': status,
      'registration_mode': registrationMode,
      'poster_url': posterUrl,
      'public_registration_url': publicRegistrationUrl,
      'public_qr_code_url': publicQrCodeUrl,
      'form_fields': formFields.map((field) => field.toJson()).toList(),
    };
  }
}
