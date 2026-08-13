import 'dart:convert';
import 'package:event_gate_admin/services/api_client.dart';

String? exportFileUrl(Map<String, dynamic> statusData) {
  final value = statusData['file_url'];
  return value is String && value.isNotEmpty ? value : null;
}

class AdminService {
  final ApiClient _api;

  AdminService({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  Future<Map<String, dynamic>> getDashboardStats() async {
    final response = await _api.get('/v1/admin/dashboard');
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['data'];
    } else {
      throw Exception('Failed to load dashboard stats');
    }
  }

  Future<Map<String, dynamic>> getEventStats(String eventId) async {
    final response = await _api.get('/v1/events/$eventId/stats');
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['data'];
    } else {
      throw Exception('Failed to load event stats');
    }
  }

  Future<String> triggerExportCSV(String eventId) async {
    final response = await _api.post('/v1/events/$eventId/export', {});
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['data']['job_id'];
    } else {
      throw Exception('Failed to trigger export');
    }
  }

  Future<Map<String, dynamic>> getExportStatus(String jobId) async {
    final response = await _api.get('/v1/exports/$jobId');
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['data'];
    } else {
      throw Exception('Failed to get export status');
    }
  }

  Future<Map<String, dynamic>> getParticipants(String eventId, {
    String? status,
    String? attendance,
    String? sort,
    String? search,
    int page = 1,
    int limit = 15,
  }) async {
    List<String> queries = ['page=$page', 'limit=$limit'];

    if (status != null && status != 'Semua') queries.add('status=$status');
    if (attendance != null && attendance != 'Semua') queries.add('attendance=${attendance == 'Hadir' ? 'true' : 'false'}');
    if (sort != null) queries.add('sort=$sort');
    if (search != null && search.isNotEmpty) queries.add('search=$search');

    final queryString = queries.isNotEmpty ? '?${queries.join('&')}' : '';
    final response = await _api.get('/v1/events/$eventId/registrations$queryString');

    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return {
        'data': json['data'],
        'meta': json['meta']
      };
    } else {
      throw Exception('Failed to load participants: ${response.body}');
    }
  }

  Future<void> reviewParticipant(String registrationId, String action) async {
    final response = await _api.post(
      '/v1/registrations/$registrationId/review',
      {'action': action},
    );
    if (response.statusCode != 200) {
      throw Exception('Failed to review participant: ${response.body}');
    }
  }
}
