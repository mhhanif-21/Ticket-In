import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const String baseUrl = 'http://127.0.0.1:3000/api'; 
  final _storage = const FlutterSecureStorage();

  Future<Map<String, String>> _getHeaders() async {
    final token = await _storage.read(key: 'auth_token');
    
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<http.Response> get(String endpoint) async {
    final headers = await _getHeaders();
    return await http.get(Uri.parse('$baseUrl$endpoint'), headers: headers);
  }

  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final headers = await _getHeaders();
    return await http.post(
      Uri.parse('$baseUrl$endpoint'),
      headers: headers,
      body: jsonEncode(body),
    );
  }

  Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final headers = await _getHeaders();
    return await http.put(
      Uri.parse('$baseUrl$endpoint'),
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
    
    final request = http.MultipartRequest(method, Uri.parse('$baseUrl$endpoint'));
    request.headers.addAll(headers);
    request.fields.addAll(fields);
    
    if (filePath != null && fileField != null) {
      request.files.add(await http.MultipartFile.fromPath(fileField, filePath));
    }
    
    return await request.send();
  }
}
