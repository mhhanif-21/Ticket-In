import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/event_model.dart';
import 'api_client.dart';

class EventService {
  final ApiClient _apiClient = ApiClient();

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

  Future<String> createEvent(Map<String, String> data, {String? posterPath}) async {
    final response = await _apiClient.multipartRequest(
      '/v1/events',
      'POST',
      data,
      filePath: posterPath,
      fileField: posterPath != null ? 'poster' : null,
    );

    if (response.statusCode == 201) {
      final resBody = await response.stream.bytesToString();
      final jsonBody = jsonDecode(resBody);
      // Backend returns either an array of objects or an object in 'data'
      if (jsonBody['data'] is List) {
        return jsonBody['data'][0]['id'];
      }
      return jsonBody['data']['id'];
    } else {
      final errorStr = await response.stream.bytesToString();
      throw Exception('Failed to create event: $errorStr');
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
