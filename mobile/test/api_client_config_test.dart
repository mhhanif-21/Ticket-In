import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/services/api_client.dart';

void main() {
  test('API base URL is configurable and builds endpoint URIs', () {
    final client = ApiClient(baseUrl: 'https://device.example.test/api');

    const expectedCompileTimeUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:3000/api',
    );
    expect(ApiClient.baseUrl, expectedCompileTimeUrl);
    expect(ApiClient.baseUrl, isNot(contains('127.0.0.1')));
    expect(client.configuredBaseUrl, 'https://device.example.test/api');
    expect(client.buildUri('/v1/events').toString(), 'https://device.example.test/api/v1/events');
  });
}
