import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final EventService _eventService = EventService();
  List<EventModel> _events = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  Future<void> _loadEvents() async {
    setState(() => _isLoading = true);
    try {
      final events = await _eventService.getEvents();
      setState(() {
        _events = events;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Event Gate Admin'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadEvents),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _events.isEmpty
              ? const Center(
                  child: Text('Belum ada acara. Silakan buat baru.'),
                )
              : ListView.builder(
                  itemCount: _events.length,
                  itemBuilder: (context, index) {
                    final event = _events[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        title: Text(event.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Mode: ${event.registrationMode}'),
                        trailing: PopupMenuButton<String>(
                          onSelected: (value) async {
                            if (value == 'edit') {
                              await context.push('/edit-event/${event.id}');
                            } else if (value == 'form') {
                              await context.push('/form-builder/${event.id}');
                            } else if (value == 'access') {
                              await context.push('/access-management/${event.id}');
                            }
                            _loadEvents();
                          },
                          itemBuilder: (context) => [
                            const PopupMenuItem(value: 'edit', child: Text('Edit Detail Acara')),
                            const PopupMenuItem(value: 'form', child: Text('Susun Form Pendaftaran')),
                            const PopupMenuItem(value: 'access', child: Text('Kelola Akses Panitia')),
                          ],
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await context.push('/create-event');
          _loadEvents();
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}


