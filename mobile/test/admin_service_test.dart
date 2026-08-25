import 'dart:convert';

import 'package:event_gate_admin/services/admin_service.dart';
import 'package:event_gate_admin/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

class FakeApiClient extends ApiClient {
  String? requestedEndpoint;

  FakeApiClient() : super(baseUrl: 'https://example.test/api');

  @override
  Future<http.Response> get(String endpoint) async {
    requestedEndpoint = endpoint;
    return http.Response(
      jsonEncode({'data': <dynamic>[], 'meta': {'totalPages': 1}}),
      200,
    );
  }
}

void main() {
  test('encodes participant search and date filters as query parameters', () async {
    final api = FakeApiClient();
    final service = AdminService(apiClient: api);

    await service.getParticipants(
      'event-1',
      search: 'A&B + tester',
      startDate: DateTime(2026, 8, 1),
      endDate: DateTime(2026, 8, 31),
    );

    expect(api.requestedEndpoint, contains('search=A%26B+%2B+tester'));
    expect(api.requestedEndpoint, contains('start_date=2026-08-01'));
    expect(api.requestedEndpoint, contains('end_date=2026-08-31'));
  });
}
