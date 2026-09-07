import 'dart:convert';
import 'dart:io';
import 'dart:math';
import '../models/event_model.dart';
import 'api_client.dart';
import 'poster_validation.dart';

class EventMediaUploadException implements Exception {
  final String message;
  final String? eventId;
  final bool metadataPersisted;

  const EventMediaUploadException(
    this.message, {
    this.eventId,
    this.metadataPersisted = false,
  });

  @override
  String toString() => message;
}

class EventCreationException implements Exception {
  final String message;
  final int statusCode;
  final bool isRetryable;
  final bool metadataPersisted;

  const EventCreationException(
    this.message, {
    required this.statusCode,
    required this.isRetryable,
    this.metadataPersisted = false,
  });

  @override
  String toString() => message;
}

class EventCatalogException implements Exception {
  final String message;
  final int statusCode;
  final bool isRetryable;

  const EventCatalogException(
    this.message, {
    required this.statusCode,
    required this.isRetryable,
  });

  @override
  String toString() => message;
}

class EventPage {
  const EventPage({
    required this.events,
    required this.page,
    required this.limit,
    required this.total,
    required this.hasNextPage,
  });

  final List<EventModel> events;
  final int page;
  final int limit;
  final int total;
  final bool hasNextPage;
}

class EventTemplateException implements Exception {
  final String message;

  const EventTemplateException(this.message);

  @override
  String toString() => message;
}

class EventService {
  final ApiClient _apiClient;

  EventService({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  Future<EventPage> getEvents({
    int page = 1,
    int limit = 20,
    String search = '',
    String sort = 'date_desc',
    String? status,
  }) async {
    final query = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
      'sort': sort,
      if (search.trim().isNotEmpty) 'search': search.trim(),
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final response = await _apiClient.get(
      '/v1/events?${Uri(queryParameters: query).query}',
    );
    if (response.statusCode == 200) {
      final jsonBody = jsonDecode(response.body) as Map<String, dynamic>;
      final List data = jsonBody['data'] as List? ?? const [];
      final meta = jsonBody['meta'] as Map<String, dynamic>? ?? const {};
      final parsedPage = int.tryParse(meta['page']?.toString() ?? '') ?? page;
      final parsedLimit =
          int.tryParse(meta['limit']?.toString() ?? '') ?? limit;
      final total =
          int.tryParse(meta['total']?.toString() ?? '') ?? data.length;
      return EventPage(
        events: data
            .map((item) => EventModel.fromJson(item as Map<String, dynamic>))
            .toList(),
        page: parsedPage,
        limit: parsedLimit,
        total: total,
        hasNextPage:
            meta['has_next_page'] == true || parsedPage * parsedLimit < total,
      );
    }

    final serviceMessage = _messageFromResponse(response.body, '');
    final isServerFailure = response.statusCode >= 500;
    final message = isServerFailure || serviceMessage == 'Internal server error'
        ? 'Event list temporarily unavailable. Please try again.'
        : serviceMessage.isNotEmpty
        ? serviceMessage
        : 'Event list could not be loaded.';
    throw EventCatalogException(
      message,
      statusCode: response.statusCode,
      isRetryable:
          response.statusCode == 408 ||
          response.statusCode == 429 ||
          response.statusCode >= 500,
    );
  }

  Future<EventModel> getEventDetail(String id) async {
    final response = await _apiClient.get('/v1/events/$id');
    if (response.statusCode == 200) {
      final jsonBody = jsonDecode(response.body);
      return EventModel.fromJson(jsonBody['data']);
    } else {
      throw Exception('Failed to load event detail');
    }
  }

  Future<String> createEvent(
    Map<String, dynamic> data, {
    String? posterPath,
    List<String> galleryPaths = const [],
    String? idempotencyKey,
  }) async {
    final createResponse = await _apiClient.post(
      '/v1/events',
      data,
      extraHeaders: {
        'Idempotency-Key': idempotencyKey ?? _generateIdempotencyKey(),
      },
    );

    if (createResponse.statusCode == 200 || createResponse.statusCode == 201) {
      final jsonBody = jsonDecode(createResponse.body);
      final id = jsonBody['data']['id'].toString();

      if (posterPath != null) {
        try {
          await uploadEventMedia(
            id,
            coverPath: posterPath,
            galleryPaths: galleryPaths,
          );
        } on EventMediaUploadException catch (error) {
          throw EventMediaUploadException(
            'Event has been saved, but media could not be uploaded. ${error.message}',
            eventId: id,
            metadataPersisted: true,
          );
        }
      }
      return id;
    }

    final serviceMessage = _messageFromResponse(createResponse.body, '');
    final isServerFailure = createResponse.statusCode >= 500;
    throw EventCreationException(
      isServerFailure || serviceMessage == 'Internal server error'
          ? 'Event could not be created. Please try again.'
          : serviceMessage.isNotEmpty
          ? serviceMessage
          : 'Event could not be created. Please try again.',
      statusCode: createResponse.statusCode,
      isRetryable:
          createResponse.statusCode == 408 ||
          createResponse.statusCode == 429 ||
          createResponse.statusCode >= 500,
    );
  }

  String _generateIdempotencyKey() {
    final random = Random.secure();
    final randomPart = List.generate(
      32,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    return '${DateTime.now().microsecondsSinceEpoch}-$randomPart';
  }

  String _messageFromResponse(String body, String fallback) {
    try {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final message = decoded['message'];
      if (message is String && message.isNotEmpty) return message;
    } catch (_) {
      // Respons non-JSON selalu dipetakan ke pesan aman untuk pengguna.
    }
    return fallback;
  }

  void _throwIfErrorPayload(String body, String fallback) {
    if (body.trim().isEmpty) return;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic> && decoded['status'] == 'error') {
        throw EventMediaUploadException(_messageFromResponse(body, fallback));
      }
    } on EventMediaUploadException {
      rethrow;
    } on FormatException {
      // A successful endpoint may return an empty/non-JSON body. HTTP 2xx is
      // still the upload acknowledgement in that case.
    }
  }

  Future<void> uploadEventMedia(
    String id, {
    required String coverPath,
    List<String> galleryPaths = const [],
  }) async {
    final coverError = await validateEventImageFile(File(coverPath));
    if (coverError != null) throw EventMediaUploadException(coverError);

    if (galleryPaths.length > maxEventPosterImages - 1) {
      throw const EventMediaUploadException(
        'Maximum 5 event posters, including the main poster.',
      );
    }
    for (final galleryPath in galleryPaths) {
      final galleryError = await validateEventImageFile(File(galleryPath));
      if (galleryError != null) throw EventMediaUploadException(galleryError);
    }

    final mediaResponse = await _apiClient.multipartFilesRequest(
      '/v1/events/$id/media',
      'POST',
      {'replace_gallery': 'true'},
      files: [
        MultipartUploadFile(field: 'cover', path: coverPath),
        ...galleryPaths.map(
          (path) => MultipartUploadFile(field: 'gallery', path: path),
        ),
      ],
    );

    final responseBody = await mediaResponse.stream.bytesToString();
    if (mediaResponse.statusCode != 200 && mediaResponse.statusCode != 201) {
      throw EventMediaUploadException(
        _messageFromResponse(
          responseBody,
          'Event media could not be uploaded. Please try again.',
        ),
      );
    }
    _throwIfErrorPayload(
      responseBody,
      'Event media could not be uploaded. Please try again.',
    );
  }

  Future<void> uploadEventPoster(String id, String posterPath) async {
    final validationError = await validateEventImageFile(File(posterPath));
    if (validationError != null) {
      throw EventMediaUploadException(validationError);
    }

    final posterResponse = await _apiClient.multipartRequest(
      '/v1/events/$id/poster',
      'POST',
      {},
      filePath: posterPath,
      fileField: 'poster',
    );

    final responseBody = await posterResponse.stream.bytesToString();
    if (posterResponse.statusCode != 200 && posterResponse.statusCode != 201) {
      throw EventMediaUploadException(
        _messageFromResponse(
          responseBody,
          'Event poster could not be uploaded. Please try again.',
        ),
      );
    }
    _throwIfErrorPayload(
      responseBody,
      'Event poster could not be uploaded. Please try again.',
    );
  }

  Future<List<EventMediaModel>> appendEventGallery(
    String id,
    List<String> galleryPaths,
  ) async {
    if (galleryPaths.isEmpty) return const [];
    if (galleryPaths.length > maxEventPosterImages - 1) {
      throw const EventMediaUploadException(
        'Maximum 5 event posters, including the main poster.',
      );
    }
    for (final galleryPath in galleryPaths) {
      final validationError = await validateEventImageFile(File(galleryPath));
      if (validationError != null) {
        throw EventMediaUploadException(validationError);
      }
    }

    final response = await _apiClient.multipartFilesRequest(
      '/v1/events/$id/media/gallery',
      'POST',
      const {},
      files: galleryPaths
          .map((path) => MultipartUploadFile(field: 'gallery', path: path))
          .toList(),
    );
    final body = await response.stream.bytesToString();
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw EventMediaUploadException(
        _messageFromResponse(
          body,
          'Event gallery could not be uploaded. Please try again.',
        ),
      );
    }
    _throwIfErrorPayload(
      body,
      'Event gallery could not be uploaded. Please try again.',
    );
    // A successful upload is still an acknowledgement when a proxy returns
    // an empty/non-JSON body. The edit screen performs a detail read-back and
    // resolves the created row from server state before reporting success.
    if (body.trim().isEmpty) return const [];
    dynamic decoded;
    try {
      decoded = jsonDecode(body);
    } on FormatException {
      return const [];
    }
    if (decoded is! Map<String, dynamic>) return const [];
    final data = decoded['data'] as Map<String, dynamic>? ?? const {};
    final media = data['media'] as List? ?? const [];
    return media
        .map((item) => EventMediaModel.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> replaceEventGallery(
    String id,
    List<String> galleryMediaIds,
  ) async {
    if (galleryMediaIds.length > maxEventPosterImages - 1) {
      throw const EventMediaUploadException(
        'Maximum 5 event posters, including the main poster.',
      );
    }
    final response = await _apiClient.patch('/v1/events/$id/media', {
      'replace_gallery': true,
      'gallery_media_ids': galleryMediaIds,
    });
    if (response.statusCode != 200) {
      throw EventMediaUploadException(
        _messageFromResponse(
          response.body,
          'Event gallery could not be updated. Please try again.',
        ),
      );
    }
    _throwIfErrorPayload(
      response.body,
      'Event gallery could not be updated. Please try again.',
    );
  }

  Future<void> promoteEventMedia(String eventId, String mediaId) async {
    if (mediaId.isEmpty) {
      throw const EventMediaUploadException(
        'Main poster not ready to be updated. Please try again.',
      );
    }
    final response = await _apiClient.patch('/v1/events/$eventId/media', {
      'promote_media_id': mediaId,
    });
    if (response.statusCode != 200) {
      throw EventMediaUploadException(
        _messageFromResponse(
          response.body,
          'Main poster could not be updated. Please try again.',
        ),
      );
    }
    _throwIfErrorPayload(
      response.body,
      'Main poster could not be updated. Please try again.',
    );
  }

  Future<void> updateEvent(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put('/v1/events/$id', data);
    if (response.statusCode != 200) {
      throw Exception('Failed to update event: ${response.body}');
    }
  }

  Future<TicketTemplateModel> getTicketTemplate(String id) async {
    final response = await _apiClient.get('/v1/events/$id/ticket-template');
    if (response.statusCode != 200) {
      throw const EventTemplateException('Ticket template could not be loaded.');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return TicketTemplateModel.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<String?> uploadTicketTemplateBackground(
    String id,
    String filePath,
  ) async {
    final validationError = await validateEventImageFile(File(filePath));
    if (validationError != null) throw EventTemplateException(validationError);

    final response = await _apiClient.multipartRequest(
      '/v1/events/$id/ticket-template/background',
      'POST',
      const {},
      filePath: filePath,
      fileField: 'background',
    );
    final responseBody = await response.stream.bytesToString();
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw EventTemplateException(
        _messageFromResponse(
          responseBody,
          'Template image could not be uploaded. Please try again.',
        ),
      );
    }
    final body = jsonDecode(responseBody) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>?)?['background_url']
        ?.toString();
  }

  Future<void> saveTicketTemplate(
    String id, {
    required String mode,
    required List<TicketTemplateElementModel> elements,
  }) async {
    final response = await _apiClient.put('/v1/events/$id/ticket-template', {
      'mode': mode,
      'elements': elements.map((item) => item.toJson()).toList(),
    });
    if (response.statusCode != 200) {
      throw EventTemplateException(
        _messageFromResponse(
          response.body,
          'Ticket template could not be saved. Please try again.',
        ),
      );
    }
  }

  Future<ApprovalEmailTemplateModel> getApprovalEmailTemplate(String id) async {
    return getEmailTemplate(id, kind: 'ticket');
  }

  Future<ApprovalEmailTemplateModel> getOtpEmailTemplate(String id) async {
    return getEmailTemplate(id, kind: 'otp');
  }

  Future<ApprovalEmailTemplateModel> getEmailTemplate(
    String id, {
    required String kind,
  }) async {
    final response = await _apiClient.get(
      '/v1/events/$id/approval-email-template?kind=$kind',
    );
    if (response.statusCode != 200) {
      throw const EventTemplateException('Email template could not be loaded.');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return ApprovalEmailTemplateModel.fromJson(
      body['data'] as Map<String, dynamic>,
    );
  }

  Future<void> saveApprovalEmailTemplate(
    String id, {
    required bool isActive,
    required String subject,
    required String body,
    String kind = 'ticket',
  }) async {
    return saveEmailTemplate(
      id,
      kind: kind,
      isActive: isActive,
      subject: subject,
      body: body,
    );
  }

  Future<void> saveOtpEmailTemplate(
    String id, {
    required bool isActive,
    required String subject,
    required String body,
  }) async {
    return saveEmailTemplate(
      id,
      kind: 'otp',
      isActive: isActive,
      subject: subject,
      body: body,
    );
  }

  Future<void> saveEmailTemplate(
    String id, {
    required String kind,
    required bool isActive,
    required String subject,
    required String body,
  }) async {
    final response = await _apiClient.put(
      '/v1/events/$id/approval-email-template',
      {
        'kind': kind,
        'is_active': isActive,
        'subject': subject,
        'body': body,
      },
    );
    if (response.statusCode != 200) {
      throw EventTemplateException(
        _messageFromResponse(
          response.body,
          'Email template could not be saved. Please try again.',
        ),
      );
    }
  }

  // Bug 5 FIX: Hapus event via DELETE
  Future<void> deleteEvent(String id) async {
    final response = await _apiClient.delete('/v1/events/$id');
    if (response.statusCode != 200) {
      throw Exception('Failed to delete event: ${response.body}');
    }
  }

  Future<void> saveFormFields(String id, List<FormFieldModel> fields) async {
    final response = await _apiClient.post('/v1/events/$id/fields', {
      'fields': fields.map((e) => e.toJson()).toList(),
    });
    if (response.statusCode != 200) {
      throw Exception('Failed to save form fields: ${response.body}');
    }
  }

  Future<String> generatePin(String id) async {
    final response = await _apiClient.post('/v1/events/$id/generate-pin', {});
    if (response.statusCode == 200) {
      final jsonBody = jsonDecode(response.body);
      return jsonBody['data']['pin'].toString();
    } else {
      throw Exception('Failed to generate PIN: ${response.body}');
    }
  }
}
