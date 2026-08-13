import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
class ApiClient {
  // Override for a physical device, Docker, staging, or production with:
  // --dart-define=API_BASE_URL=https://api.example.com/api
  // The default targets the Android emulator host bridge.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );
  final String _baseUrl;
  final _storage = const FlutterSecureStorage();

  ApiClient({String? baseUrl}) : _baseUrl = baseUrl ?? ApiClient.baseUrl;

  Uri buildUri(String endpoint) => Uri.parse('$_baseUrl$endpoint');

  String get configuredBaseUrl => _baseUrl;

  Future<Map<String, String>> _getHeaders() async {
    final token = await _storage.read(key: 'auth_token');

    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<http.Response> get(String endpoint) async {
    final headers = await _getHeaders();
    return await http.get(buildUri(endpoint), headers: headers);
  }

  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final headers = await _getHeaders();
    return await http.post(
      buildUri(endpoint),
      headers: headers,
      body: jsonEncode(body),
    );
  }

  Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final headers = await _getHeaders();
    return await http.put(
      buildUri(endpoint),
      headers: headers,
      body: jsonEncode(body),
    );
  }

  Future<http.StreamedResponse> multipartRequest(
    String endpoint,
    String method,
    Map<String, String> fields,
    {String? filePath, String? fileField}
  ) async {
    final headers = await _getHeaders();
    headers.remove('Content-Type'); // Let http library set the boundary automatically

    final request = http.MultipartRequest(method, buildUri(endpoint));
    request.headers.addAll(headers);
    request.fields.addAll(fields);

    if (filePath != null && fileField != null) {
      final file = File(filePath);
      final raf = file.openSync();
      final bytes = raf.readSync(8);
      raf.closeSync();

      String mimeType = 'application/octet-stream';
      if (bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) {
        mimeType = 'image/jpeg';
      } else if (bytes.length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
        mimeType = 'image/png';
      }

      final mimeParts = mimeType.split('/');

      request.files.add(await http.MultipartFile.fromPath(
        fileField,
        filePath,
        contentType: MediaType(mimeParts[0], mimeParts[1]),
      ));
    }

    return await request.send();
  }
}
