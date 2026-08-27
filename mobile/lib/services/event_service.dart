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
        ? 'Daftar acara sementara tidak tersedia. Silakan coba lagi.'
        : serviceMessage.isNotEmpty
        ? serviceMessage
        : 'Daftar acara belum dapat dimuat.';
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

    if (createResponse.statusCode == 201 || createResponse.statusCode == 200) {
      final jsonBody = jsonDecode(createResponse.body);
      final String id = jsonBody['data'] is List
          ? jsonBody['data'][0]['id'].toString()
          : jsonBody['data']['id'].toString();

      if (posterPath != null) {
        try {
          await uploadEventMedia(
            id,
            coverPath: posterPath,
            galleryPaths: galleryPaths,
          );
        } on EventMediaUploadException catch (error) {
          throw EventMediaUploadException(
            'Acara sudah tersimpan, tetapi media belum terunggah. ${error.message}',
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
          ? 'Acara belum dapat dibuat. Silakan coba lagi.'
          : serviceMessage.isNotEmpty
          ? serviceMessage
          : 'Acara belum dapat dibuat. Silakan coba lagi.',
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

  Future<void> uploadEventMedia(
    String id, {
    required String coverPath,
    List<String> galleryPaths = const [],
  }) async {
    final coverError = await validateEventImageFile(File(coverPath));
    if (coverError != null) throw EventMediaUploadException(coverError);

    if (galleryPaths.length > 5) {
      throw const EventMediaUploadException(
        'Maksimal 5 foto galeri per acara.',
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

    if (mediaResponse.statusCode != 200 && mediaResponse.statusCode != 201) {
      final responseBody = await mediaResponse.stream.bytesToString();
      throw EventMediaUploadException(
        _messageFromResponse(
          responseBody,
          'Media acara belum dapat diunggah. Silakan coba lagi.',
        ),
      );
    }
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

    if (posterResponse.statusCode != 200 && posterResponse.statusCode != 201) {
      final errorStr = await posterResponse.stream.bytesToString();
      throw EventMediaUploadException(
        _messageFromResponse(
          errorStr,
          'Poster acara belum dapat diunggah. Silakan coba lagi.',
        ),
      );
    }
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
      throw const EventTemplateException('Template tiket belum dapat dimuat.');
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
          'Gambar template belum dapat diunggah. Silakan coba lagi.',
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
          'Template tiket belum dapat disimpan. Silakan coba lagi.',
        ),
      );
    }
  }

  Future<ApprovalEmailTemplateModel> getApprovalEmailTemplate(String id) async {
    final response = await _apiClient.get(
      '/v1/events/$id/approval-email-template',
    );
    if (response.statusCode != 200) {
      throw const EventTemplateException('Template email belum dapat dimuat.');
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
  }) async {
    final response = await _apiClient.put(
      '/v1/events/$id/approval-email-template',
      {'is_active': isActive, 'subject': subject, 'body': body},
    );
    if (response.statusCode != 200) {
      throw EventTemplateException(
        _messageFromResponse(
          response.body,
          'Template email belum dapat disimpan. Silakan coba lagi.',
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
