import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../services/api_client.dart';
import '../providers/admin_providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _apiClient = ApiClient();
  final _storage = const FlutterSecureStorage();

  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email dan Password tidak boleh kosong')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await _apiClient.post('/v1/auth/admin/login', {
        'email': email,
        'password': password,
      });

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final data = body['data'] as Map<String, dynamic>?;
        final accessToken = data?['access_token'];
        final refreshToken = data?['refresh_token'];
        if (accessToken is! String ||
            accessToken.isEmpty ||
            refreshToken is! String ||
            refreshToken.isEmpty) {
          throw const FormatException(
            'Respons login tidak memiliki session lengkap',
          );
        }

        await _storage.write(key: ApiClient.accessTokenKey, value: accessToken);
        await _storage.write(
          key: ApiClient.refreshTokenKey,
          value: refreshToken,
        );

        if (mounted) {
          ref.read(authSessionProvider).markAuthenticated();
          context.go(
            '/admin-dashboard',
          ); // [BUG-045] FIX: Arahkan ke Dashboard sebagai landing page admin
        }
      } else {
        final body = jsonDecode(response.body);
        final errorMessage = body['message'] ?? 'Login gagal';
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(errorMessage)));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Terjadi kesalahan koneksi: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF000000);
    const surfaceColor = Color(0xFFF9F9F9);
    const surfaceContainerLowestColor = Color(0xFFFFFFFF);
    const outlineVariantColor = Color(0xFFC4C7C7);
    const onSurfaceColor = Color(0xFF1A1C1C);
    const onSurfaceVariantColor = Color(0xFF444748);
    const onPrimaryContainerColor = Color(0xFF1C1B1B);

    return Scaffold(
      backgroundColor: surfaceColor,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Brand Header
                  const Icon(
                    Icons.event_available,
                    size: 48,
                    color: primaryColor,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Event Gate',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: primaryColor,
                      letterSpacing: -0.02,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Login Card
                  Container(
                    decoration: BoxDecoration(
                      color: surfaceContainerLowestColor,
                      border: Border.all(color: outlineVariantColor),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Welcome Text
                        const Text(
                          'Masuk ke Akun',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            color: onSurfaceColor,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Kelola event dan pendaftaran Anda di satu tempat.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 14,
                            color: onSurfaceVariantColor,
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Email Input
                        TextField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(
                            prefixIcon: const Icon(
                              Icons.mail_outline,
                              color: outlineVariantColor,
                            ),
                            hintText: 'Email',
                            hintStyle: const TextStyle(
                              color: outlineVariantColor,
                            ),
                            filled: true,
                            fillColor: surfaceContainerLowestColor,
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 16,
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: outlineVariantColor,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(color: primaryColor),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Password Input
                        TextField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          decoration: InputDecoration(
                            prefixIcon: const Icon(
                              Icons.lock_outline,
                              color: outlineVariantColor,
                            ),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                                color: outlineVariantColor,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscurePassword = !_obscurePassword;
                                });
                              },
                            ),
                            hintText: 'Password',
                            hintStyle: const TextStyle(
                              color: outlineVariantColor,
                            ),
                            filled: true,
                            fillColor: surfaceContainerLowestColor,
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 16,
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: outlineVariantColor,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(color: primaryColor),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // [MOB-BUG-014] FIX: "Ingat saya" dan "Lupa sandi?" dihapus karena belum ada implementasi backend
                        // Akan ditambahkan kembali saat fitur siap
                        const SizedBox(height: 8),
                        const SizedBox(height: 24),

                        // Submit Button
                        ElevatedButton(
                          onPressed: _isLoading ? null : _handleLogin,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: primaryColor,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            elevation: 0,
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: onPrimaryContainerColor,
                                  ),
                                )
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      'Masuk',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    SizedBox(width: 8),
                                    Icon(Icons.login, size: 20),
                                  ],
                                ),
                        ),
                      ],
                    ),
                  ),

                  // Footer Links
                  const SizedBox(height: 32),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Bantuan',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF747878),
                        ),
                      ),
                      SizedBox(width: 16),
                      Text('•', style: TextStyle(color: outlineVariantColor)),
                      SizedBox(width: 16),
                      Text(
                        'Privasi',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF747878),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
