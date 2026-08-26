import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../widgets/adaptive_event_image.dart';
import 'package:intl/intl.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final EventService _eventService = EventService();
  List<EventModel> _events = [];
  bool _isLoading = true;
  String _searchQuery = '';
  // [BUG-047] FIX: Tambah state untuk sorting
  String _sortOrder = 'newest'; // 'newest' | 'oldest'

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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error: $e')));
      setState(() => _isLoading = false);
    }
  }

  // [BUG-048] FIX: Hapus _showEventOptions (Bottom Sheet) — navigasi ke halaman detail
  void _navigateToEventDetail(EventModel event) {
    context.push('/event-detail/${event.id}').then((_) => _loadEvents());
  }

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF000000);
    const surfaceColor = Color(0xFFF9F9F9);
    const surfaceContainerColor = Color(0xFFEEEEEE);
    const outlineVariantColor = Color(0xFFC4C7C7);
    const outlineColor = Color(0xFF747878);
    const onSurfaceColor = Color(0xFF1A1C1C);
    const onSurfaceVariantColor = Color(0xFF444748);
    const secondaryColor = Color(0xFF5D5D5D);
    const errorColor = Color(0xFFBA1A1A);

    // [BUG-047] FIX: Sort list berdasarkan _sortOrder sebelum filter search
    final sortedEvents = [..._events];
    sortedEvents.sort(
      (a, b) => _sortOrder == 'newest'
          ? b.date.compareTo(a.date)
          : a.date.compareTo(b.date),
    );
    final filteredEvents = sortedEvents
        .where((e) => e.name.toLowerCase().contains(_searchQuery.toLowerCase()))
        .toList();

    return Scaffold(
      // [BUG-042] FIX: Hapus extendBody:true agar Navbar tidak menutupi list event
      backgroundColor: surfaceColor,
      appBar: AppBar(
        backgroundColor: surfaceColor,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 20,
        title: const Text(
          'Semua Event',
          style: TextStyle(
            color: primaryColor,
            fontSize: 20,
            fontWeight: FontWeight.bold,
            letterSpacing: -0.01,
          ),
        ),
        // [BUG-046] FIX: Hapus ikon profil dari AppBar halaman Daftar Acara
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: outlineVariantColor, height: 1.0),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: primaryColor))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: surfaceColor,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: outlineVariantColor),
                          ),
                          child: TextField(
                            onChanged: (val) =>
                                setState(() => _searchQuery = val),
                            decoration: const InputDecoration(
                              hintText: 'Cari nama event...',
                              hintStyle: TextStyle(
                                color: outlineColor,
                                fontSize: 14,
                              ),
                              prefixIcon: Icon(
                                Icons.search,
                                color: outlineColor,
                              ),
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(
                                vertical: 14,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // [BUG-047] FIX: Tombol sort sekarang interaktif — tap untuk toggle Terbaru/Terlama
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _sortOrder = _sortOrder == 'newest'
                                ? 'oldest'
                                : 'newest';
                          });
                        },
                        child: Container(
                          height: 48,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          decoration: BoxDecoration(
                            color: surfaceColor,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: outlineVariantColor),
                          ),
                          child: Row(
                            children: [
                              Text(
                                _sortOrder == 'newest'
                                    ? 'Urutkan: Terbaru'
                                    : 'Urutkan: Terlama',
                                style: const TextStyle(
                                  color: secondaryColor,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Icon(
                                _sortOrder == 'newest'
                                    ? Icons.arrow_downward
                                    : Icons.arrow_upward,
                                color: secondaryColor,
                                size: 18,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // [MOB-BUG-002] FIX: RefreshIndicator agar admin bisa pull-to-refresh daftar event
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () async => _loadEvents(),
                    color: primaryColor,
                    child: filteredEvents.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: const [
                              SizedBox(height: 200),
                              Center(
                                child: Text(
                                  'Belum ada acara. Silakan buat baru.',
                                  style: TextStyle(
                                    color: onSurfaceVariantColor,
                                  ),
                                ),
                              ),
                            ],
                          )
                        : ListView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                            itemCount: filteredEvents.length,
                            itemBuilder: (context, index) {
                              final event = filteredEvents[index];
                              final dateStr = DateFormat(
                                'dd MMM yyyy',
                              ).format(event.date);

                              Color badgeBgColor = primaryColor.withOpacity(
                                0.1,
                              );
                              Color badgeTextColor = primaryColor;
                              String badgeText = 'Confirmed';

                              if (event.registrationMode == 'Manual Review') {
                                badgeBgColor = errorColor.withOpacity(0.1);
                                badgeTextColor = errorColor;
                                badgeText = 'Review';
                              }

                              return InkWell(
                                // [BUG-048] FIX: Navigate ke halaman detail, bukan buka Bottom Sheet
                                onTap: () => _navigateToEventDetail(event),
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: surfaceColor,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: outlineVariantColor,
                                    ),
                                  ),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      SizedBox(
                                        width: 80,
                                        child:
                                            event.posterUrl != null &&
                                                event.posterUrl!.isNotEmpty
                                            ? AdaptiveEventImage(
                                                image: NetworkImage(
                                                  event.posterUrl!,
                                                ),
                                                backgroundColor:
                                                    surfaceContainerColor,
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              )
                                            : Container(
                                                height: 96,
                                                decoration: BoxDecoration(
                                                  color: surfaceContainerColor,
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                                child: const Icon(
                                                  Icons.image,
                                                  color: outlineVariantColor,
                                                ),
                                              ),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              event.name,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                                color: onSurfaceColor,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Row(
                                              children: [
                                                const Icon(
                                                  Icons.calendar_today,
                                                  size: 14,
                                                  color: onSurfaceVariantColor,
                                                ),
                                                const SizedBox(width: 4),
                                                Text(
                                                  dateStr,
                                                  style: const TextStyle(
                                                    fontSize: 14,
                                                    color:
                                                        onSurfaceVariantColor,
                                                  ),
                                                ),
                                              ],
                                            ),
                                            const SizedBox(height: 2),
                                            Row(
                                              children: [
                                                const Icon(
                                                  Icons.location_on,
                                                  size: 14,
                                                  color: onSurfaceVariantColor,
                                                ),
                                                const SizedBox(width: 4),
                                                Expanded(
                                                  child: Text(
                                                    event.location,
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      fontSize: 14,
                                                      color:
                                                          onSurfaceVariantColor,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                            const SizedBox(height: 8),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 8,
                                                    vertical: 4,
                                                  ),
                                              decoration: BoxDecoration(
                                                color: badgeBgColor,
                                                borderRadius:
                                                    BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                badgeText,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w600,
                                                  color: badgeTextColor,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ),
              ],
            ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 24.0),
        child: FloatingActionButton(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          elevation: 4,
          onPressed: () async {
            await context.push('/create-event');
            _loadEvents();
          },
          child: const Icon(Icons.add),
        ),
      ),
      // [BUG-042] FIX: Navbar sekarang full-block menempel di bawah (bukan floating pill)
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: surfaceColor,
          border: const Border(
            top: BorderSide(color: outlineVariantColor, width: 1.0),
          ),
        ),
        child: SafeArea(
          maintainBottomViewPadding: true,
          child: SizedBox(
            key: const ValueKey('home-bottom-navigation'),
            height: 64,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                // [BUG-044] FIX: Dari Dashboard, gunakan context.go bukan context.push
                _buildNavItem(
                  Icons.dashboard,
                  'Dashboard',
                  false,
                  () => context.go('/admin-dashboard'),
                ),
                _buildNavItem(Icons.calendar_today, 'Event', true, () {}),
                // [BUG-043] FIX: Settings menampilkan SnackBar "Segera Hadir"
                _buildNavItem(Icons.settings, 'Settings', false, () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('⚙️ Pengaturan — Segera Hadir'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    IconData icon,
    String label,
    bool isActive,
    VoidCallback onTap,
  ) {
    const primaryContainerColor = Color(0xFFE5E2E1);
    const onPrimaryContainerColor = Color(0xFF1C1B1B);
    const onSurfaceVariantColor = Color(0xFF444748);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        decoration: isActive
            ? BoxDecoration(
                color: primaryContainerColor,
                borderRadius: BorderRadius.circular(12),
              )
            : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: isActive ? onPrimaryContainerColor : onSurfaceVariantColor,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: isActive
                    ? onPrimaryContainerColor
                    : onSurfaceVariantColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
