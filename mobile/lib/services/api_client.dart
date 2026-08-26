import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class AuthSessionStore {
  Future<String?> read({required String key});

  Future<void> write({required String key, required String value});

  Future<void> delete({required String key});
}

/// Broadcasts a terminal refresh-token failure to the app router.  This is
/// intentionally process-local: tokens remain only in secure storage.
class SessionInvalidationNotifier extends ChangeNotifier {
  void notifySessionInvalidated() => notifyListeners();
}

class SecureAuthSessionStore implements AuthSessionStore {
  final FlutterSecureStorage _storage;

  const SecureAuthSessionStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  @override
  Future<String?> read({required String key}) => _storage.read(key: key);

  @override
  Future<void> write({required String key, required String value}) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete({required String key}) => _storage.delete(key: key);
}

class MultipartUploadFile {
  final String field;
  final String path;

  const MultipartUploadFile({required this.field, required this.path});
}

class ApiClient {
  // Every build must provide its endpoint explicitly. For local Android
  // debugging, pass --dart-define=API_BASE_URL=http://10.0.2.2:3000/api.
  // Release builds are additionally checked by Gradle and only accept HTTPS.
  static const String configuredApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
  );
  static const bool isReleaseBuild = bool.fromEnvironment('dart.vm.product');
  static final String baseUrl = resolveBaseUrl(
    configuredApiBaseUrl,
    releaseBuild: isReleaseBuild,
  );

  static const Set<String> _localDevelopmentHosts = {
    'localhost',
    '127.0.0.1',
    '::1',
    '10.0.2.2',
    '10.0.3.2',
  };

  static String resolveBaseUrl(
    String rawBaseUrl, {
    required bool releaseBuild,
  }) {
    final value = rawBaseUrl.trim();
    if (value.isEmpty) {
      throw StateError(
        'API_BASE_URL wajib diisi. Gunakan --dart-define=API_BASE_URL=<url>.',
      );
    }

    final uri = Uri.tryParse(value);
    if (uri == null ||
        (uri.scheme != 'http' && uri.scheme != 'https') ||
        uri.host.isEmpty) {
      throw StateError(
        'API_BASE_URL harus berupa URL HTTP(S) absolut yang valid.',
      );
    }

    final host = uri.host.toLowerCase();
    if (releaseBuild &&
        (uri.scheme != 'https' || _localDevelopmentHosts.contains(host))) {
      throw StateError(
        'Release API_BASE_URL wajib HTTPS dan tidak boleh menuju host lokal atau emulator.',
      );
    }

    return value;
  }

  final String _baseUrl;

  // [MOB-BUG-006] FIX: Timeout constant agar tidak infinite loading
  static const Duration _timeout = Duration(seconds: 15);
  static const String accessTokenKey = 'auth_token';
  static const String refreshTokenKey = 'refresh_token';

  final AuthSessionStore _storage;
  final http.Client _httpClient;
  final SessionInvalidationNotifier _sessionEvents;
  Future<bool>? _refreshInFlight;

  static final SessionInvalidationNotifier sessionEvents =
      SessionInvalidationNotifier();

  ApiClient({
    String? baseUrl,
    AuthSessionStore? sessionStore,
    http.Client? httpClient,
    SessionInvalidationNotifier? sessionEvents,
  }) : _baseUrl = resolveBaseUrl(
         baseUrl ?? configuredApiBaseUrl,
         releaseBuild: isReleaseBuild,
       ),
       _storage = sessionStore ?? const SecureAuthSessionStore(),
       _httpClient = httpClient ?? http.Client(),
       _sessionEvents = sessionEvents ?? ApiClient.sessionEvents;

  Uri buildUri(String endpoint) => Uri.parse('$_baseUrl$endpoint');

  String get configuredBaseUrl => _baseUrl;

  Future<Map<String, String>> _getHeaders() async {
    final token = await _storage.read(key: accessTokenKey);

    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<bool> _refreshSession() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    late final Future<bool> refresh;
    refresh = _refreshSessionInternal().whenComplete(() {
      if (identical(_refreshInFlight, refresh)) {
        _refreshInFlight = null;
      }
    });
    _refreshInFlight = refresh;
    return refresh;
  }

  Future<bool> _refreshSessionInternal() async {
    final refreshToken = await _storage.read(key: refreshTokenKey);
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      final response = await _httpClient
          .post(
            buildUri('/v1/auth/admin/refresh'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': refreshToken}),
          )
          .timeout(_timeout);

      if (response.statusCode != 200) {
        throw StateError('Refresh session rejected');
      }

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>?;
      final accessToken = data?['access_token'];
      final nextRefreshToken = data?['refresh_token'];
      if (accessToken is! String ||
          accessToken.isEmpty ||
          nextRefreshToken is! String ||
          nextRefreshToken.isEmpty) {
        throw const FormatException('Refresh response tidak lengkap');
      }

      await _storage.write(key: accessTokenKey, value: accessToken);
      await _storage.write(key: refreshTokenKey, value: nextRefreshToken);
      return true;
    } catch (_) {
      await clearSession();
      _sessionEvents.notifySessionInvalidated();
      return false;
    }
  }

  /// A stored token pair is not considered a valid session until its refresh
  /// token is accepted by the API. This runs once during app bootstrap.
  Future<bool> restoreSession() async {
    final accessToken = await _storage.read(key: accessTokenKey);
    final refreshToken = await _storage.read(key: refreshTokenKey);
    if (accessToken == null ||
        accessToken.isEmpty ||
        refreshToken == null ||
        refreshToken.isEmpty) {
      await clearSession();
      return false;
    }
    return _refreshSession();
  }

  Future<void> clearSession() async {
    await _storage.delete(key: accessTokenKey);
    await _storage.delete(key: refreshTokenKey);
  }

  Future<http.Response> _sendJsonRequest(
    Future<http.Response> Function(Map<String, String> headers) request,
  ) async {
    final response = await request(await _getHeaders()).timeout(_timeout);
    if (response.statusCode != 401 || !await _refreshSession()) {
      return response;
    }
    return request(await _getHeaders()).timeout(_timeout);
  }

  Future<http.StreamedResponse> _sendMultipartRequest(
    Future<http.StreamedResponse> Function() request,
  ) async {
    final response = await request();
    if (response.statusCode != 401 || !await _refreshSession()) {
      return response;
    }
    return request();
  }

  // [MOB-BUG-006] FIX: Semua method HTTP sekarang memiliki timeout 15 detik
  Future<http.Response> get(String endpoint) async {
    return _sendJsonRequest(
      (headers) => _httpClient.get(buildUri(endpoint), headers: headers),
    );
  }

  Future<http.Response> post(
    String endpoint,
    Map<String, dynamic> body, {
    Map<String, String> extraHeaders = const {},
  }) async {
    return _sendJsonRequest((headers) {
      headers.addAll(extraHeaders);
      return _httpClient.post(
        buildUri(endpoint),
        headers: headers,
        body: jsonEncode(body),
      );
    });
  }

  Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    return _sendJsonRequest(
      (headers) => _httpClient.put(
        buildUri(endpoint),
        headers: headers,
        body: jsonEncode(body),
      ),
    );
  }

  // Bug 5 FIX: Tambah method delete
  Future<http.Response> delete(String endpoint) async {
    return _sendJsonRequest(
      (headers) => _httpClient.delete(buildUri(endpoint), headers: headers),
    );
  }

  Future<http.StreamedResponse> multipartRequest(
    String endpoint,
    String method,
    Map<String, String> fields, {
    String? filePath,
    String? fileField,
  }) async {
    return _sendMultipartRequest(() async {
      final headers = await _getHeaders();
      headers.remove('Content-Type');

      final request = http.MultipartRequest(method, buildUri(endpoint));
      request.headers.addAll(headers);
      request.fields.addAll(fields);

      if (filePath != null && fileField != null) {
        final file = File(filePath);
        final raf = file.openSync();
        final bytes = raf.readSync(8);
        raf.closeSync();

        String mimeType = 'application/octet-stream';
        if (bytes.length >= 3 &&
            bytes[0] == 0xFF &&
            bytes[1] == 0xD8 &&
            bytes[2] == 0xFF) {
          mimeType = 'image/jpeg';
        } else if (bytes.length >= 8 &&
            bytes[0] == 0x89 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x4E &&
            bytes[3] == 0x47) {
          mimeType = 'image/png';
        }

        final mimeParts = mimeType.split('/');
        request.files.add(
          await http.MultipartFile.fromPath(
            fileField,
            filePath,
            contentType: MediaType(mimeParts[0], mimeParts[1]),
          ),
        );
      }

      return request.send().timeout(_timeout);
    });
  }

  Future<http.StreamedResponse> multipartFilesRequest(
    String endpoint,
    String method,
    Map<String, String> fields, {
    required List<MultipartUploadFile> files,
  }) async {
    return _sendMultipartRequest(() async {
      final headers = await _getHeaders();
      headers.remove('Content-Type');

      final request = http.MultipartRequest(method, buildUri(endpoint));
      request.headers.addAll(headers);
      request.fields.addAll(fields);

      for (final uploadFile in files) {
        final file = File(uploadFile.path);
        final bytes = await file
            .openRead(0, 12)
            .fold<List<int>>([], (all, chunk) => all..addAll(chunk));
        String mimeType = 'application/octet-stream';
        if (bytes.length >= 3 &&
            bytes[0] == 0xFF &&
            bytes[1] == 0xD8 &&
            bytes[2] == 0xFF) {
          mimeType = 'image/jpeg';
        } else if (bytes.length >= 8 &&
            bytes[0] == 0x89 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x4E &&
            bytes[3] == 0x47) {
          mimeType = 'image/png';
        } else if (bytes.length >= 12 &&
            bytes[0] == 0x52 &&
            bytes[1] == 0x49 &&
            bytes[2] == 0x46 &&
            bytes[3] == 0x46 &&
            bytes[8] == 0x57 &&
            bytes[9] == 0x45 &&
            bytes[10] == 0x42 &&
            bytes[11] == 0x50) {
          mimeType = 'image/webp';
        }

        final mimeParts = mimeType.split('/');
        request.files.add(
          await http.MultipartFile.fromPath(
            uploadFile.field,
            uploadFile.path,
            contentType: MediaType(mimeParts[0], mimeParts[1]),
          ),
        );
      }

      return request.send().timeout(_timeout);
    });
  }
}
