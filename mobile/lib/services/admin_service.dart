import 'dart:convert';
import 'package:event_gate_admin/services/api_client.dart';

String? exportFileUrl(Map<String, dynamic> statusData) {
  final value = statusData['file_url'];
  return value is String && value.isNotEmpty ? value : null;
}

class ParticipantFileResource {
  final Uri url;
  final String fileName;
  final String mimeType;

  const ParticipantFileResource({
    required this.url,
    required this.fileName,
    required this.mimeType,
  });

  bool get isImage => mimeType.toLowerCase().startsWith('image/');
  bool get isPdf => mimeType.toLowerCase() == 'application/pdf';
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
    DateTime? startDate,
    DateTime? endDate,
    int page = 1,
    int limit = 15,
  }) async {
    final queryParameters = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
    };

    if (status != null && status != 'Semua') queryParameters['status'] = status;
    if (attendance != null && attendance != 'Semua') {
      queryParameters['attendance'] = attendance == 'Hadir' ? 'true' : 'false';
    }
    if (sort != null) queryParameters['sort'] = sort;
    if (search != null && search.isNotEmpty) queryParameters['search'] = search;
    if (startDate != null) queryParameters['start_date'] = _dateQueryValue(startDate);
    if (endDate != null) queryParameters['end_date'] = _dateQueryValue(endDate);

    final encodedQuery = Uri(queryParameters: queryParameters).query;
    final queryString = encodedQuery.isEmpty ? '' : '?$encodedQuery';
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

  Future<Map<String, dynamic>> getParticipantDetail(String registrationId) async {
    final response = await _api.get('/v1/registrations/$registrationId');
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final data = json['data'];
      if (data is Map) return Map<String, dynamic>.from(data);
    }
    throw Exception('Failed to load participant detail');
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

  String _dateQueryValue(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  Future<void> retryTicketGeneration(String registrationId) async {
    final response = await _api.post(
      '/v1/registrations/$registrationId/ticket/retry',
      {},
    );
    if (response.statusCode != 200) {
      throw Exception('Failed to retry ticket generation: ${response.body}');
    }
  }

  Future<ParticipantFileResource> getParticipantFile(
    String registrationId,
    String fieldKey,
  ) async {
    final response = await _api.get('/v1/registrations/$registrationId/files/$fieldKey');
    if (response.statusCode != 200) {
      throw Exception('Berkas belum dapat dibuka. Silakan coba lagi.');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>?;
    final url = data?['url']?.toString();
    final fileName = data?['file_name']?.toString() ?? 'Berkas peserta';
    final mimeType = data?['mime_type']?.toString() ?? 'application/octet-stream';
    if (url == null || url.isEmpty || Uri.tryParse(url) == null) {
      throw Exception('Berkas belum dapat dibuka. Silakan coba lagi.');
    }
    return ParticipantFileResource(
      url: Uri.parse(url),
      fileName: fileName,
      mimeType: mimeType,
    );
  }

  Future<Uri> getParticipantFileUrl(String registrationId, String fieldKey) async {
    return (await getParticipantFile(registrationId, fieldKey)).url;
  }
}
