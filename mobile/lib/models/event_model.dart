class FormFieldModel {
  final String? id;
  final String? fieldKey;
  final String fieldKind;
  final String fieldName;
  final String fieldType;
  final bool isRequired;
  final List<String>? options;
  final int order;

  FormFieldModel({
    this.id,
    this.fieldKey,
    this.fieldKind = 'custom',
    required this.fieldName,
    required this.fieldType,
    required this.isRequired,
    this.options,
    required this.order,
  });

  factory FormFieldModel.fromJson(Map<String, dynamic> json) {
    return FormFieldModel(
      id: json['id']?.toString() ?? json['field_id']?.toString(),
      fieldKey: json['field_key']?.toString() ?? json['fieldKey']?.toString(),
      fieldKind:
          json['field_kind']?.toString() ??
          json['fieldKind']?.toString() ??
          'custom',
      fieldName: json['field_name'] ?? json['fieldName'] ?? '',
      fieldType: json['field_type'] ?? json['fieldType'] ?? 'text',
      isRequired: json['is_required'] ?? json['isRequired'] ?? false,
      options: json['options'] != null
          ? List<String>.from(json['options'])
          : null,
      order: json['order'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      if (fieldKey != null) 'field_key': fieldKey,
      'field_kind': fieldKind,
      'field_name': fieldName,
      'field_type': fieldType,
      'is_required': isRequired,
      'options': options,
      'order': order,
    };
  }

  FormFieldModel copyWith({
    String? id,
    String? fieldKey,
    String? fieldKind,
    String? fieldName,
    String? fieldType,
    bool? isRequired,
    List<String>? options,
    int? order,
  }) => FormFieldModel(
    id: id ?? this.id,
    fieldKey: fieldKey ?? this.fieldKey,
    fieldKind: fieldKind ?? this.fieldKind,
    fieldName: fieldName ?? this.fieldName,
    fieldType: fieldType ?? this.fieldType,
    isRequired: isRequired ?? this.isRequired,
    options: options ?? this.options,
    order: order ?? this.order,
  );
}

class EventMediaModel {
  final String id;
  final String role;
  final int displayOrder;
  final String publicUrl;

  EventMediaModel({
    required this.id,
    required this.role,
    required this.displayOrder,
    required this.publicUrl,
  });

  factory EventMediaModel.fromJson(Map<String, dynamic> json) {
    return EventMediaModel(
      id: json['id']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      displayOrder: json['display_order'] ?? json['displayOrder'] ?? 0,
      publicUrl: json['public_url'] ?? json['publicUrl'] ?? '',
    );
  }
}

class TicketTemplateElementModel {
  final String type;
  final String? token;
  final double x;
  final double y;
  final double width;
  final double height;

  const TicketTemplateElementModel({
    required this.type,
    this.token,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory TicketTemplateElementModel.fromJson(Map<String, dynamic> json) {
    return TicketTemplateElementModel(
      type: json['type']?.toString() ?? '',
      token: json['token']?.toString(),
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      width: (json['width'] as num?)?.toDouble() ?? 0.2,
      height: (json['height'] as num?)?.toDouble() ?? 0.1,
    );
  }

  TicketTemplateElementModel copyWith({
    double? x,
    double? y,
    double? width,
    double? height,
  }) {
    return TicketTemplateElementModel(
      type: type,
      token: token,
      x: x ?? this.x,
      y: y ?? this.y,
      width: width ?? this.width,
      height: height ?? this.height,
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    if (token != null) 'token': token,
    'x': x,
    'y': y,
    'width': width,
    'height': height,
  };
}

class TicketTemplateModel {
  final String mode;
  final String? backgroundUrl;
  final List<TicketTemplateElementModel> elements;
  final List<String> tokenOptions;

  const TicketTemplateModel({
    required this.mode,
    this.backgroundUrl,
    this.elements = const [],
    this.tokenOptions = const [],
  });

  factory TicketTemplateModel.fromJson(Map<String, dynamic> json) {
    return TicketTemplateModel(
      mode: json['mode']?.toString() ?? 'default',
      backgroundUrl: json['background_url']?.toString(),
      elements: (json['elements'] as List? ?? const [])
          .map(
            (item) => TicketTemplateElementModel.fromJson(
              item as Map<String, dynamic>,
            ),
          )
          .toList(),
      tokenOptions: (json['token_options'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }
}

class ApprovalEmailTemplateModel {
  final bool isActive;
  final String subject;
  final String body;
  final List<String> tokenOptions;

  const ApprovalEmailTemplateModel({
    required this.isActive,
    required this.subject,
    required this.body,
    this.tokenOptions = const [],
  });

  factory ApprovalEmailTemplateModel.fromJson(Map<String, dynamic> json) {
    return ApprovalEmailTemplateModel(
      isActive: json['is_active'] == true,
      subject: json['subject']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      tokenOptions: (json['token_options'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
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
  final List<EventMediaModel> media;

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
    this.media = const [],
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    var formFieldsList = <FormFieldModel>[];
    var mediaList = <EventMediaModel>[];
    // BUG-H FIX: Backend (Drizzle) mengembalikan 'formFields' (camelCase), bukan 'form_fields'
    final rawFields = json['form_fields'] ?? json['formFields'];
    if (rawFields != null) {
      formFieldsList = (rawFields as List)
          .map((e) => FormFieldModel.fromJson(e))
          .toList();
    }
    final rawMedia = json['media'];
    if (rawMedia != null) {
      mediaList = (rawMedia as List)
          .map((item) => EventMediaModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }

    return EventModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      capacity: json['capacity'] ?? 0,
      location: json['location'] ?? '',
      description: json['description'],
      date: json['date'] != null
          ? DateTime.parse(json['date'])
          : DateTime.now(),
      status: json['status'] ?? 'Draft',
      registrationMode:
          json['registration_mode'] ??
          json['registrationMode'] ??
          'Auto-Accept',
      posterUrl: json['poster_url'] ?? json['posterUrl'],
      publicRegistrationUrl:
          json['public_registration_url'] ?? json['publicRegistrationUrl'],
      publicQrCodeUrl: json['public_qr_code_url'] ?? json['publicQrCodeUrl'],
      formFields: formFieldsList,
      media: mediaList,
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
      'media': media
          .map(
            (item) => {
              'id': item.id,
              'role': item.role,
              'display_order': item.displayOrder,
              'public_url': item.publicUrl,
            },
          )
          .toList(),
    };
  }
}
