import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';
// [MOB-BUG-013] FIX: Import dari provider terpusat
import '../providers/admin_providers.dart';

typedef ExportUrlOpener = Future<bool> Function(String url);

class ParticipantsState {
  final List<dynamic> participants;
  final bool isLoading;
  final bool isFetchingMore;
  final bool hasMore;
  final int page;
  final String searchQuery;
  final String filterStatus;
  final String filterAttendance;
  final String filterSort;
  final String? error;

  ParticipantsState({
    this.participants = const [],
    this.isLoading = true,
    this.isFetchingMore = false,
    this.hasMore = true,
    this.page = 1,
    this.searchQuery = '',
    this.filterStatus = 'Semua',
    this.filterAttendance = 'Semua',
    this.filterSort = 'desc',
    this.error,
  });

  ParticipantsState copyWith({
    List<dynamic>? participants,
    bool? isLoading,
    bool? isFetchingMore,
    bool? hasMore,
    int? page,
    String? searchQuery,
    String? filterStatus,
    String? filterAttendance,
    String? filterSort,
    String? error,
    bool clearError = false,
  }) {
    return ParticipantsState(
      participants: participants ?? this.participants,
      isLoading: isLoading ?? this.isLoading,
      isFetchingMore: isFetchingMore ?? this.isFetchingMore,
      hasMore: hasMore ?? this.hasMore,
      page: page ?? this.page,
      searchQuery: searchQuery ?? this.searchQuery,
      filterStatus: filterStatus ?? this.filterStatus,
      filterAttendance: filterAttendance ?? this.filterAttendance,
      filterSort: filterSort ?? this.filterSort,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ParticipantsNotifier extends FamilyNotifier<ParticipantsState, String> {
  late String eventId;
  late final AdminService adminService;

  @override
  ParticipantsState build(String eventId) {
    this.eventId = eventId;
    adminService = ref.read(adminServiceProvider);
    Future.microtask(_loadInitial);
    return ParticipantsState();
  }

  Future<void> _loadInitial() async {
    state = state.copyWith(isLoading: true, error: null, clearError: true);
    try {
      final res = await adminService.getParticipants(
        eventId,
        status: state.filterStatus,
        attendance: state.filterAttendance,
        sort: state.filterSort,
        search: state.searchQuery,
        page: 1,
      );
      final data = res['data'] as List;
      final totalPages = res['meta']['totalPages'] as int;

      state = state.copyWith(
        participants: data,
        hasMore: 1 < totalPages,
        page: 1,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.isLoading || state.isFetchingMore || !state.hasMore) return;

    state = state.copyWith(isFetchingMore: true);
    try {
      final nextPage = state.page + 1;
      final res = await adminService.getParticipants(
        eventId,
        status: state.filterStatus,
        attendance: state.filterAttendance,
        sort: state.filterSort,
        search: state.searchQuery,
        page: nextPage,
      );
      final data = res['data'] as List;
      final totalPages = res['meta']['totalPages'] as int;

      state = state.copyWith(
        participants: [...state.participants, ...data],
        hasMore: nextPage < totalPages,
        page: nextPage,
        isFetchingMore: false,
      );
    } catch (e) {
      state = state.copyWith(isFetchingMore: false, error: e.toString());
    }
  }

  void updateSearch(String query) {
    if (state.searchQuery == query) return;
    state = state.copyWith(searchQuery: query);
    _loadInitial();
  }

  void updateFilters({String? status, String? attendance, String? sort}) {
    state = state.copyWith(
      filterStatus: status,
      filterAttendance: attendance,
      filterSort: sort,
    );
    _loadInitial();
  }

  void refresh() {
    _loadInitial();
  }
}

final participantsProvider =
    NotifierProvider.family<ParticipantsNotifier, ParticipantsState, String>(
      ParticipantsNotifier.new,
    );

class ParticipantsScreen extends ConsumerStatefulWidget {
  final String eventId;
  final ExportUrlOpener? exportUrlOpener;
  final Duration exportPollInterval;
  final int exportMaxAttempts;

  const ParticipantsScreen({
    super.key,
    required this.eventId,
    this.exportUrlOpener,
    this.exportPollInterval = const Duration(seconds: 3),
    this.exportMaxAttempts = 15,
  });

  @override
  ConsumerState<ParticipantsScreen> createState() => _ParticipantsScreenState();
}

class _ParticipantsScreenState extends ConsumerState<ParticipantsScreen> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;
  bool _isExporting = false;
  String? _exportFeedback;

  @override
  void initState() {
    super.initState();
    // [BUG-065] FIX: Infinite scrolling listener
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        ref.read(participantsProvider(widget.eventId).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      ref
          .read(participantsProvider(widget.eventId).notifier)
          .updateSearch(query);
    });
  }

  Future<bool> _openExportUrl(String url) async {
    final uri = Uri.parse(url);
    if (!await canLaunchUrl(uri)) return false;
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _setExportFeedback(String message) {
    if (mounted) setState(() => _exportFeedback = message);
  }

  // [BUG-051] FIX: Implementasi Export CSV polling
  void _triggerExport() async {
    setState(() {
      _isExporting = true;
      _exportFeedback = null;
    });
    final service = ref.read(adminServiceProvider);
    try {
      final jobId = await service.triggerExportCSV(widget.eventId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Menyiapkan file ekspor... Harap tunggu')),
      );

      final openUrl = widget.exportUrlOpener ?? _openExportUrl;
      bool isReady = false;
      for (int i = 0; i < widget.exportMaxAttempts; i++) {
        await Future.delayed(widget.exportPollInterval);
        final statusRes = await service.getExportStatus(jobId);

        if (statusRes['status'] == 'completed') {
          isReady = true;
          final fileUrl = exportFileUrl(statusRes);
          if (fileUrl != null && await openUrl(fileUrl)) {
            _setExportFeedback('Membuka browser untuk mengunduh...');
            if (mounted)
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Membuka browser untuk mengunduh...'),
                ),
              );
          }
          break;
        } else if (statusRes['status'] == 'failed') {
          throw Exception(statusRes['error'] ?? 'Ekspor gagal di server');
        }
      }

      if (!isReady && mounted) {
        _setExportFeedback(
          'Waktu tunggu habis. Proses mungkin masih berjalan di background.',
        );
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Waktu tunggu habis. Proses mungkin masih berjalan di background.',
            ),
          ),
        );
      }
    } catch (e) {
      _setExportFeedback('Gagal: $e');
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal: $e')));
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  // [BUG-049] FIX: 3 Filter Options + [BUG-064] Fix filter redundan (chip dihapus dari luar)
  void _showFilterBottomSheet() {
    final notifier = ref.read(participantsProvider(widget.eventId).notifier);
    final currentState = ref.read(participantsProvider(widget.eventId));

    String tempStatus = currentState.filterStatus;
    String tempAttendance = currentState.filterAttendance;
    String tempSort = currentState.filterSort;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.9,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: MediaQuery.of(context).viewInsets.bottom,
                    left: 24,
                    right: 24,
                    top: 24,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Filter & Urutkan',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Hanya 1 tipe filter yang dapat aktif bersamaan (Sistem M-E)',
                        style: TextStyle(fontSize: 12, color: Colors.orange),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Filter 1: Status Pendaftaran
                              const Text(
                                'Status Tiket',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                // [BUG-050] FIX: Tambah 'Draft' ke opsi filter status
                                children:
                                    [
                                      'Semua',
                                      'Pending',
                                      'Accepted',
                                      'Rejected',
                                      'Draft',
                                    ].map((status) {
                                      final isSelected = tempStatus == status;
                                      return ChoiceChip(
                                        label: Text(status),
                                        selected: isSelected,
                                        onSelected: (selected) {
                                          setSheetState(() {
                                            if (selected) {
                                              tempStatus = status;
                                              tempAttendance =
                                                  'Semua'; // Reset mutually exclusive filters
                                            }
                                          });
                                        },
                                        selectedColor: AppColors
                                            .primaryContainer
                                            .withOpacity(0.2),
                                        backgroundColor:
                                            AppColors.surfaceContainerLow,
                                        labelStyle: TextStyle(
                                          color: isSelected
                                              ? AppColors.onPrimaryContainer
                                              : AppColors.secondary,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      );
                                    }).toList(),
                              ),
                              const SizedBox(height: 24),

                              // Filter 2: Kehadiran (Attendance)
                              const Text(
                                'Kehadiran (Check-in)',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: ['Semua', 'Hadir', 'Tidak Hadir'].map((
                                  att,
                                ) {
                                  final isSelected = tempAttendance == att;
                                  return ChoiceChip(
                                    label: Text(att),
                                    selected: isSelected,
                                    onSelected: (selected) {
                                      setSheetState(() {
                                        if (selected) {
                                          tempAttendance = att;
                                          tempStatus =
                                              'Semua'; // Reset mutually exclusive filters
                                        }
                                      });
                                    },
                                    selectedColor: AppColors.primaryContainer
                                        .withOpacity(0.2),
                                    backgroundColor:
                                        AppColors.surfaceContainerLow,
                                    labelStyle: TextStyle(
                                      color: isSelected
                                          ? AppColors.onPrimaryContainer
                                          : AppColors.secondary,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 24),

                              // Filter 3: Waktu Pendaftaran (Sort)
                              const Text(
                                'Waktu Pendaftaran',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  _buildSortChip(
                                    'Terbaru',
                                    'desc',
                                    tempSort,
                                    (val) =>
                                        setSheetState(() => tempSort = val),
                                  ),
                                  _buildSortChip(
                                    'Terlama',
                                    'asc',
                                    tempSort,
                                    (val) =>
                                        setSheetState(() => tempSort = val),
                                  ),
                                ],
                              ),

                              const SizedBox(height: 24),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.onPrimary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: () {
                            notifier.updateFilters(
                              status: tempStatus,
                              attendance: tempAttendance,
                              sort: tempSort,
                            );
                            Navigator.pop(context);
                          },
                          child: const Text(
                            'Terapkan Filter',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildSortChip(
    String label,
    String value,
    String currentVal,
    Function(String) onSelect,
  ) {
    final isSelected = currentVal == value;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        if (selected) onSelect(value);
      },
      selectedColor: AppColors.primaryContainer.withOpacity(0.2),
      backgroundColor: AppColors.surfaceContainerLow,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.onPrimaryContainer : AppColors.secondary,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // [BUG-063] FIX: Menggunakan Riverpod StateNotifierProvider alih-alih setState lokal yang kotor
    final state = ref.watch(participantsProvider(widget.eventId));

    // Handle error UI feedback once
    if (state.error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(state.error!)));
      });
    }

    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLow,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.primary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Daftar Peserta',
          style: TextStyle(
            color: AppColors.primary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: _isExporting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primary,
                    ),
                  )
                : const Icon(Icons.download, color: AppColors.primary),
            onPressed: _isExporting ? null : _triggerExport,
          ),
          IconButton(
            icon: const Icon(Icons.more_vert, color: AppColors.primary),
            onPressed: () {},
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: AppColors.outlineVariant, height: 1.0),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.read(participantsProvider(widget.eventId).notifier).refresh();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.outlineVariant),
                      ),
                      child: TextField(
                        controller: _searchController,
                        onChanged:
                            _onSearchChanged, // [BUG-052] FIX: Fungsi pencarian sudah dihubungkan dengan API
                        decoration: const InputDecoration(
                          hintText: 'Cari nama atau email...',
                          prefixIcon: Icon(
                            Icons.search,
                            color: AppColors.outline,
                          ),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  InkWell(
                    onTap: _showFilterBottomSheet,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color:
                              (state.filterStatus != 'Semua' ||
                                  state.filterAttendance != 'Semua')
                              ? AppColors.primary
                              : AppColors.outlineVariant,
                        ),
                      ),
                      child: Icon(
                        Icons.tune,
                        color:
                            (state.filterStatus != 'Semua' ||
                                state.filterAttendance != 'Semua')
                            ? AppColors.primary
                            : AppColors.secondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_exportFeedback != null)
                Container(
                  key: const ValueKey('export-feedback'),
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_exportFeedback!),
                ),

              // [BUG-064] FIX: Chip filter redundan di bawah search bar TELAH DIHAPUS
              Expanded(
                child: state.isLoading && state.participants.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : state.participants.isEmpty
                    ? const Center(
                        child: Text('Tidak ada pendaftar ditemukan.'),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount:
                            state.participants.length +
                            (state.isFetchingMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == state.participants.length) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16.0),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8.0),
                            child: _buildParticipantCard(
                              state.participants[index],
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusBgColor(String status) {
    switch (status.toLowerCase()) {
      case 'accepted':
        return const Color(0xFF41674B).withOpacity(0.1);
      case 'rejected':
        return const Color(0xFFBA1A1A).withOpacity(0.1);
      // [BUG-050] FIX: Tambahan warna status Draft
      case 'draft':
        return Colors.grey.withOpacity(0.1);
      default:
        return Colors.orange.withOpacity(0.1);
    }
  }

  Color _getStatusTextColor(String status) {
    switch (status.toLowerCase()) {
      case 'accepted':
        return const Color(0xFF41674B);
      case 'rejected':
        return const Color(0xFFBA1A1A);
      // [BUG-050] FIX: Tambahan warna teks status Draft
      case 'draft':
        return Colors.grey.shade700;
      default:
        return Colors.orange.shade800;
    }
  }

  Widget _buildParticipantCard(Map<String, dynamic> p) {
    final name = p['name'] ?? 'Unknown';
    final organization = p['company'] ?? p['organization'] ?? '-';
    // [BUG-050] FIX: Mendukung status "Draft"
    final status = p['status'] ?? 'Pending';
    final attendance = p['presenceStatus'] ?? 'Absent';

    return InkWell(
      onTap: () async {
        final result = await context.push('/review-detail', extra: p);
        if (result != null) {
          ref.read(participantsProvider(widget.eventId).notifier).refresh();
        }
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.outlineVariant),
              ),
              alignment: Alignment.center,
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: AppColors.secondary,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurface,
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          organization,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.secondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (attendance == 'Present')
                        const Padding(
                          padding: EdgeInsets.only(left: 8.0),
                          child: Icon(
                            Icons.check_circle,
                            size: 14,
                            color: Colors.green,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _getStatusBgColor(status),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _getStatusBgColor(status)),
              ),
              child: Text(
                status,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: _getStatusTextColor(status),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
