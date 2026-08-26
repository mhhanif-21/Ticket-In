import 'dart:convert';
import 'dart:io';
import 'dart:math';
import '../models/event_model.dart';
import 'api_client.dart';
import 'poster_validation.dart';

class EventMediaUploadException implements Exception {
  final String message;

  const EventMediaUploadException(this.message);

  @override
  String toString() => message;
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

  Future<List<EventModel>> getEvents() async {
    final response = await _apiClient.get('/v1/events');
    if (response.statusCode == 200) {
      final jsonBody = jsonDecode(response.body);
      final List data = jsonBody['data'];
      return data.map((e) => EventModel.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load events');
    }
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
        await uploadEventMedia(
          id,
          coverPath: posterPath,
          galleryPaths: galleryPaths,
        );
      }
      return id;
    } else {
      throw EventMediaUploadException(
        _messageFromResponse(
          createResponse.body,
          'Acara belum dapat dibuat. Silakan coba lagi.',
        ),
      );
    }
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
