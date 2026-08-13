import 'dart:convert';
import 'dart:io';
import '../models/event_model.dart';
import 'api_client.dart';
import 'poster_validation.dart';

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

  Future<String> createEvent(Map<String, dynamic> data, {String? posterPath}) async {
    final createResponse = await _apiClient.post('/v1/events', data);

    if (createResponse.statusCode == 201 || createResponse.statusCode == 200) {
      final jsonBody = jsonDecode(createResponse.body);
      final String id = jsonBody['data'] is List
          ? jsonBody['data'][0]['id'].toString()
          : jsonBody['data']['id'].toString();

      if (posterPath != null) {
        await uploadEventPoster(id, posterPath);
      }
      return id;
    } else {
      throw Exception('Failed to create event: ${createResponse.body}');
    }
  }

  Future<void> uploadEventPoster(String id, String posterPath) async {
    if (!await hasSupportedPosterSignature(File(posterPath))) {
      throw ArgumentError('Poster must be a valid JPEG or PNG image');
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
      throw Exception('Failed to upload poster: $errorStr');
    }
  }

  Future<void> updateEvent(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put('/v1/events/$id', data);
    if (response.statusCode != 200) {
      throw Exception('Failed to update event: ${response.body}');
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
