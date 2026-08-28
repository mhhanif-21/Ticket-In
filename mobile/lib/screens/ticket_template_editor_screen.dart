import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/event_model.dart';
import '../services/event_service.dart';

enum _ResizeHandle { topLeft, topRight, bottomLeft, bottomRight }

/// A bounded, full-screen editor for the normalized ticket template model.
///
/// The editor deliberately keeps the interaction surface small: the canvas is
/// fixed to the available viewport, and the same normalized x/y/width/height,
/// fontSize, and color values are sent to the server renderer.
class TicketTemplateEditorScreen extends StatefulWidget {
  final String eventId;
  final EventService eventService;
  final String? backgroundUrl;
  final File? localBackground;
  final double backgroundAspectRatio;
  final List<TicketTemplateElementModel> initialElements;

  const TicketTemplateEditorScreen({
    super.key,
    required this.eventId,
    required this.eventService,
    required this.backgroundUrl,
    required this.localBackground,
    required this.backgroundAspectRatio,
    required this.initialElements,
  });

  @override
  State<TicketTemplateEditorScreen> createState() =>
      _TicketTemplateEditorScreenState();
}

class _TicketTemplateEditorScreenState
    extends State<TicketTemplateEditorScreen> {
  static const _paletteTokens = <String>['NAME', 'EMAIL', 'EVENT_NAME'];

  static const _textColorPresets = <String>[
    '#111111',
    '#FFFFFF',
    '#6B7280',
    '#DC2626',
    '#2563EB',
    '#16A34A',
    '#EAB308',
  ];

  late List<TicketTemplateElementModel> _elements;
  late final double _backgroundAspectRatio;
  int? _selectedIndex;
  bool _dirty = false;
  bool _isSaving = false;
  bool _isHandlingBack = false;

  @override
  void initState() {
    super.initState();
    _backgroundAspectRatio =
        widget.backgroundAspectRatio.isFinite &&
            widget.backgroundAspectRatio > 0
        ? widget.backgroundAspectRatio
        : 0.75;
    _elements = widget.initialElements.map(_normalizeElement).toList();
    if (!_elements.any((element) => element.type == 'qr')) {
      _elements.add(
        _normalizeElement(
          const TicketTemplateElementModel(
            type: 'qr',
            x: 0.35,
            y: 0.18,
            width: 0.30,
            height: 0.30,
          ),
        ),
      );
    }
    if (!_elements.any((element) => element.type == 'ticket_code')) {
      _elements.add(
        _normalizeElement(
          const TicketTemplateElementModel(
            type: 'ticket_code',
            x: 0.15,
            y: 0.62,
            width: 0.70,
            height: 0.10,
          ),
        ),
      );
    }
  }

  TicketTemplateElementModel _normalizeElement(
    TicketTemplateElementModel element,
  ) {
    // Keep the minimum geometry large enough for the resize handles to remain
    // reachable. QR also needs a meaningful physical square before the first
    // gesture; legacy templates occasionally contain very small boxes.
    final minimumWidth = element.type == 'qr' ? ticketTemplateMinQrSize : 0.08;
    final width = _clamp(element.width, minimumWidth, 1.0);
    final minimumHeight = element.type == 'qr' ? ticketTemplateMinQrSize : 0.04;
    final height = _clamp(element.height, minimumHeight, 1.0);
    final x = _clamp(element.x, 0.0, 1.0 - width);
    final y = _clamp(element.y, 0.0, 1.0 - height);
    final fontSize = _clamp(
      element.fontSize,
      ticketTemplateMinFontSize,
      ticketTemplateMaxFontSize,
    );
    return element.copyWith(
      x: x,
      y: y,
      width: width,
      height: height,
      fontSize: fontSize,
    );
  }

  double _clamp(double value, double min, double max) {
    if (!value.isFinite) return min;
    return value.clamp(min, max).toDouble();
  }

  String? _elementToken(TicketTemplateElementModel element) {
    switch (element.type) {
      case 'name':
        return 'NAME';
      case 'email':
        return 'EMAIL';
      case 'event_name':
        return 'EVENT_NAME';
      case 'ticket_code':
        return 'CODE';
      default:
        return null;
    }
  }

  String _elementLabel(TicketTemplateElementModel element) {
    switch (element.type) {
      case 'qr':
        return 'QR Code';
      case 'ticket_code':
        return 'Kode Tiket';
      case 'name':
        return 'Nama';
      case 'email':
        return 'Email';
      case 'event_name':
        return 'Nama Event';
      default:
        return 'Elemen';
    }
  }

  List<String> get _availableTokens {
    final used = _elements.map(_elementToken).whereType<String>().toSet();
    return _paletteTokens.where((token) => !used.contains(token)).toList();
  }

  Color _colorFromHex(String value) {
    final normalized = value.replaceFirst('#', '');
    final parsed = int.tryParse('FF$normalized', radix: 16);
    return parsed == null ? const Color(0xFF111111) : Color(parsed);
  }

  void _select(int index) {
    if (!mounted || index < 0 || index >= _elements.length) return;
    setState(() => _selectedIndex = index);
  }

  void _clearSelection() {
    if (!mounted || _selectedIndex == null) return;
    setState(() => _selectedIndex = null);
  }

  void _moveElement(int index, Offset delta, Size canvasSize) {
    if (index < 0 || index >= _elements.length || !mounted) return;
    final current = _elements[index];
    final x = _clamp(
      current.x + delta.dx / canvasSize.width,
      0.0,
      1.0 - current.width,
    );
    final y = _clamp(
      current.y + delta.dy / canvasSize.height,
      0.0,
      1.0 - current.height,
    );
    setState(() {
      _selectedIndex = index;
      _dirty = true;
      _elements[index] = current.copyWith(x: x, y: y);
    });
  }

  void _resizeElement(
    int index,
    _ResizeHandle handle,
    Offset delta,
    Size canvasSize,
  ) {
    if (index < 0 || index >= _elements.length || !mounted) return;
    final current = _elements[index];
    if (current.type == 'qr') {
      _resizeQr(index, handle, delta, canvasSize, current);
      return;
    }

    final dx = delta.dx / canvasSize.width;
    final dy = delta.dy / canvasSize.height;
    var x = current.x;
    var y = current.y;
    var width = current.width;
    var height = current.height;

    switch (handle) {
      case _ResizeHandle.bottomRight:
        width = _clamp(width + dx, 0.08, 1.0 - x);
        height = _clamp(height + dy, 0.04, 1.0 - y);
      case _ResizeHandle.topLeft:
        final nextX = _clamp(x + dx, 0.0, x + width - 0.08);
        final nextY = _clamp(y + dy, 0.0, y + height - 0.04);
        width += x - nextX;
        height += y - nextY;
        x = nextX;
        y = nextY;
      case _ResizeHandle.topRight:
        final nextY = _clamp(y + dy, 0.0, y + height - 0.04);
        width = _clamp(width + dx, 0.08, 1.0 - x);
        height += y - nextY;
        y = nextY;
      case _ResizeHandle.bottomLeft:
        final nextX = _clamp(x + dx, 0.0, x + width - 0.08);
        width += x - nextX;
        height = _clamp(height + dy, 0.04, 1.0 - y);
        x = nextX;
    }

    final scale = math.max(width / current.width, height / current.height);
    final fontSize = _clamp(
      current.fontSize * scale,
      ticketTemplateMinFontSize,
      ticketTemplateMaxFontSize,
    );
    setState(() {
      _selectedIndex = index;
      _dirty = true;
      _elements[index] = current.copyWith(
        x: x,
        y: y,
        width: width,
        height: height,
        fontSize: fontSize,
      );
    });
  }

  void _resizeQr(
    int index,
    _ResizeHandle handle,
    Offset delta,
    Size canvasSize,
    TicketTemplateElementModel current,
  ) {
    final currentLeft = current.x * canvasSize.width;
    final currentTop = current.y * canvasSize.height;
    final currentRight = currentLeft + current.width * canvasSize.width;
    final currentBottom = currentTop + current.height * canvasSize.height;
    final currentSize = math.min(
      current.width * canvasSize.width,
      current.height * canvasSize.height,
    );
    final signedDelta = switch (handle) {
      _ResizeHandle.bottomRight => math.max(delta.dx, delta.dy),
      _ResizeHandle.topLeft => math.max(-delta.dx, -delta.dy),
      _ResizeHandle.topRight => math.max(delta.dx, -delta.dy),
      _ResizeHandle.bottomLeft => math.max(-delta.dx, delta.dy),
    };
    final minSize =
        ticketTemplateMinQrSize * math.min(canvasSize.width, canvasSize.height);
    final maxSize = math.min(
      math.min(canvasSize.width, canvasSize.height),
      math.min(
        handle == _ResizeHandle.topLeft || handle == _ResizeHandle.bottomLeft
            ? currentRight
            : canvasSize.width - currentLeft,
        handle == _ResizeHandle.topLeft || handle == _ResizeHandle.topRight
            ? currentBottom
            : canvasSize.height - currentTop,
      ),
    );
    final size = _clamp(currentSize + signedDelta, minSize, maxSize);
    var left = currentLeft;
    var top = currentTop;
    if (handle == _ResizeHandle.topLeft || handle == _ResizeHandle.bottomLeft) {
      left = currentRight - size;
    }
    if (handle == _ResizeHandle.topLeft || handle == _ResizeHandle.topRight) {
      top = currentBottom - size;
    }
    left = _clamp(left, 0.0, canvasSize.width - size);
    top = _clamp(top, 0.0, canvasSize.height - size);

    setState(() {
      _selectedIndex = index;
      _dirty = true;
      _elements[index] = current.copyWith(
        x: left / canvasSize.width,
        y: top / canvasSize.height,
        width: size / canvasSize.width,
        height: size / canvasSize.height,
      );
    });
  }

  void _addElement(String token) {
    if (!_availableTokens.contains(token)) return;
    final type = switch (token) {
      'NAME' => 'name',
      'EMAIL' => 'email',
      'EVENT_NAME' => 'event_name',
      _ => 'field',
    };
    final y = _clamp(0.70 + _elements.length * 0.06, 0.0, 0.86);
    setState(() {
      _elements.add(
        TicketTemplateElementModel(
          type: type,
          x: 0.12,
          y: y,
          width: 0.70,
          height: 0.10,
          fontSize: ticketTemplateDefaultFontSize,
        ),
      );
      _selectedIndex = _elements.length - 1;
      _dirty = true;
    });
  }

  void _removeSelectedElement() {
    final index = _selectedIndex;
    if (index == null || index < 0 || index >= _elements.length) return;
    final element = _elements[index];
    if (element.type == 'qr' || element.type == 'ticket_code') return;
    setState(() {
      _elements.removeAt(index);
      _selectedIndex = null;
      _dirty = true;
    });
  }

  void _setSelectedTextColor(String color) {
    final index = _selectedIndex;
    if (index == null || index < 0 || index >= _elements.length) return;
    final element = _elements[index];
    if (element.type == 'qr') return;
    setState(() {
      _elements[index] = element.copyWith(color: color);
      _dirty = true;
    });
  }

  Rect _elementRect(TicketTemplateElementModel element, Size canvasSize) {
    final rawLeft = element.x * canvasSize.width;
    final rawTop = element.y * canvasSize.height;
    final rawWidth = element.width * canvasSize.width;
    final rawHeight = element.height * canvasSize.height;
    if (element.type != 'qr') {
      return Rect.fromLTWH(rawLeft, rawTop, rawWidth, rawHeight);
    }
    final size = math.min(rawWidth, rawHeight);
    return Rect.fromLTWH(
      rawLeft + (rawWidth - size) / 2,
      rawTop + (rawHeight - size) / 2,
      size,
      size,
    );
  }

  Widget _buildCanvasElement(
    int index,
    TicketTemplateElementModel element,
    Size canvasSize,
  ) {
    final selected = index == _selectedIndex;
    final rect = _elementRect(element, canvasSize);
    final isQr = element.type == 'qr';
    final fontSize =
        (element.fontSize * canvasSize.width / ticketTemplateCanvasWidth)
            .clamp(1.0, 160.0)
            .toDouble();

    return Positioned.fromRect(
      rect: rect,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          GestureDetector(
            key: ValueKey('ticket-template-element-$index'),
            behavior: HitTestBehavior.translucent,
            onTap: () => _select(index),
            onPanStart: (_) => _select(index),
            onPanUpdate: (details) =>
                _moveElement(index, details.delta, canvasSize),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: isQr ? Colors.white : Colors.transparent,
                border: selected
                    ? Border.all(color: Colors.white70, width: 1)
                    : null,
              ),
              child: Center(
                child: isQr
                    ? const FittedBox(
                        fit: BoxFit.contain,
                        child: Icon(Icons.qr_code_2, color: Colors.black),
                      )
                    : Text(
                        _elementLabel(element),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: _colorFromHex(element.color),
                          fontWeight: FontWeight.w700,
                          fontSize: fontSize,
                        ),
                      ),
              ),
            ),
          ),
          if (selected)
            ..._ResizeHandle.values.map(
              (handle) => _buildResizeHandle(index, handle, canvasSize),
            ),
        ],
      ),
    );
  }

  Widget _buildResizeHandle(int index, _ResizeHandle handle, Size canvasSize) {
    final isBottomRight = handle == _ResizeHandle.bottomRight;
    final keyName = isBottomRight
        ? 'ticket-template-resize-handle-$index'
        : 'ticket-template-resize-handle-$index-${handle.name}';
    final alignment = switch (handle) {
      _ResizeHandle.topLeft => const Alignment(-1, -1),
      _ResizeHandle.topRight => const Alignment(1, -1),
      _ResizeHandle.bottomLeft => const Alignment(-1, 1),
      _ResizeHandle.bottomRight => const Alignment(1, 1),
    };
    return Align(
      alignment: alignment,
      child: GestureDetector(
        key: ValueKey(keyName),
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) => _select(index),
        onPanUpdate: (details) =>
            _resizeElement(index, handle, details.delta, canvasSize),
        child: Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Colors.black87, width: 1.2),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
      ),
    );
  }

  Widget _buildCanvas() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth = constraints.maxWidth > 24
            ? constraints.maxWidth - 24
            : constraints.maxWidth;
        final availableHeight = constraints.maxHeight > 24
            ? constraints.maxHeight - 24
            : constraints.maxHeight;
        var width = availableWidth;
        var height = width / _backgroundAspectRatio;
        if (height > availableHeight) {
          height = availableHeight;
          width = height * _backgroundAspectRatio;
        }
        final canvasSize = Size(width, height);
        return Center(
          child: SizedBox(
            width: width,
            height: height,
            child: GestureDetector(
              key: const ValueKey('ticket-template-fullscreen-canvas'),
              behavior: HitTestBehavior.opaque,
              onTap: _clearSelection,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  clipBehavior: Clip.none,
                  fit: StackFit.expand,
                  children: [
                    if (widget.localBackground != null)
                      Image.file(widget.localBackground!, fit: BoxFit.fill)
                    else if (widget.backgroundUrl != null)
                      Image.network(
                        widget.backgroundUrl!,
                        fit: BoxFit.fill,
                        errorBuilder: (_, _, _) => const ColoredBox(
                          color: Color(0xFF292929),
                          child: Center(
                            child: Text(
                              'Gambar latar tidak dapat dimuat',
                              style: TextStyle(color: Colors.white),
                            ),
                          ),
                        ),
                      )
                    else
                      const ColoredBox(color: Color(0xFF292929)),
                    Positioned(
                      top: 8,
                      left: 12,
                      right: 12,
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.all(Radius.circular(8)),
                          ),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 7,
                            ),
                            child: Text(
                              'Geser elemen untuk memindahkan. Tarik sudut untuk mengubah ukuran.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    ..._elements.asMap().entries.map(
                      (entry) => _buildCanvasElement(
                        entry.key,
                        entry.value,
                        canvasSize,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildColorPicker() {
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _textColorPresets.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final color = _textColorPresets[index];
          final selected =
              _selectedIndex != null &&
              _elements[_selectedIndex!].color.toLowerCase() ==
                  color.toLowerCase();
          return InkWell(
            key: ValueKey('ticket-template-color-$color'),
            onTap: () => _setSelectedTextColor(color),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: _colorFromHex(color),
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? Colors.blue : Colors.black38,
                  width: selected ? 3 : 1,
                ),
              ),
              child: selected
                  ? Icon(
                      Icons.check,
                      size: 16,
                      color: color == '#FFFFFF' || color == '#EAB308'
                          ? Colors.black
                          : Colors.white,
                    )
                  : null,
            ),
          );
        },
      ),
    );
  }

  Widget _buildBottomToolbar() {
    final index = _selectedIndex;
    final selectedElement = index == null ? null : _elements[index];
    if (selectedElement != null) {
      final required =
          selectedElement.type == 'qr' || selectedElement.type == 'ticket_code';
      return Material(
        color: Colors.white,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Elemen dipilih: ${_elementLabel(selectedElement)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (!required)
                      TextButton.icon(
                        key: const ValueKey('ticket-template-delete-element'),
                        onPressed: _removeSelectedElement,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Hapus'),
                      )
                    else
                      const Text(
                        'Wajib',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
                if (selectedElement.type != 'qr') ...[
                  const SizedBox(height: 4),
                  const Text('Warna teks'),
                  const SizedBox(height: 6),
                  _buildColorPicker(),
                ] else
                  const Text('QR wajib dan selalu berbentuk square.'),
              ],
            ),
          ),
        ),
      );
    }

    return Material(
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tambah elemen',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 40,
                child: _availableTokens.isEmpty
                    ? const Align(
                        alignment: Alignment.centerLeft,
                        child: Text('Semua elemen opsional sudah digunakan.'),
                      )
                    : ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _availableTokens.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 8),
                        itemBuilder: (context, index) {
                          final token = _availableTokens[index];
                          return ActionChip(
                            key: ValueKey('ticket-template-token-$token'),
                            label: Text('[$token]'),
                            onPressed: () => _addElement(token),
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

  Future<void> _handleBack() async {
    if (_isHandlingBack || _isSaving) return;
    _isHandlingBack = true;
    final shouldDiscard =
        !_dirty ||
        await showDialog<bool>(
              context: context,
              builder: (dialogContext) => AlertDialog(
                title: const Text('Buang perubahan?'),
                content: const Text(
                  'Perubahan template yang belum disimpan akan hilang.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text('Batal'),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Buang'),
                  ),
                ],
              ),
            ) ==
            true;
    _isHandlingBack = false;
    if (shouldDiscard && mounted) Navigator.of(context).pop();
  }

  Future<void> _saveAndClose() async {
    if (_isSaving) return;
    if (!_elements.any((element) => element.type == 'qr') ||
        !_elements.any((element) => element.type == 'ticket_code')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR dan Kode Tiket wajib tersedia.')),
      );
      return;
    }
    setState(() => _isSaving = true);
    try {
      await widget.eventService.saveTicketTemplate(
        widget.eventId,
        mode: 'custom',
        elements: List<TicketTemplateElementModel>.of(_elements),
      );
      if (!mounted) return;
      Navigator.of(context).pop(List<TicketTemplateElementModel>.of(_elements));
    } on EventTemplateException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Template tiket belum dapat disimpan. Silakan coba lagi.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF1D1D1D),
        appBar: AppBar(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          leading: IconButton(
            tooltip: 'Kembali',
            onPressed: _handleBack,
            icon: const Icon(Icons.close),
          ),
          title: const Text('Edit Template Tiket'),
          actions: [
            TextButton(
              key: const ValueKey('ticket-template-editor-done'),
              onPressed: _isSaving ? null : _saveAndClose,
              child: Text(
                _isSaving ? 'Menyimpan...' : 'Selesai',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            Expanded(child: _buildCanvas()),
            _buildBottomToolbar(),
          ],
        ),
      ),
    );
  }
}
