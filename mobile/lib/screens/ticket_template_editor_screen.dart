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
  // ── Layout constants ──────────────────────────────────────────────────
  static const _minimumTextWidth = 0.04;
  static const _minimumTextHeight = 0.02;
  static const _maximumTextWidth = 0.95;
  static const _maximumTextHeight = 0.50;
  static const _textHorizontalPadding = 8.0;
  static const _textVerticalPadding = 6.0;
  static const _resizeHandleDiameter = 20.0;
  static const _resizeHandleTouchPadding = 8.0;
  static const _selectionInset = _resizeHandleDiameter / 2;
  static const _paletteTokens = <String>['NAME', 'EMAIL', 'EVENT_NAME'];

  static const _textColorPresets = <String>[
    '#111111',
    '#FFFFFF',
    '#6B7280',
    '#DC2626',
    '#2563EB',
    '#16A34A',
    '#EAB308',
    '#7C3AED',
    '#EC4899',
  ];

  // ── Selection accent ──────────────────────────────────────────────────
  static const _selectionColor = Color(0xFF2979FF);

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
    final minimumWidth = element.type == 'qr'
        ? ticketTemplateMinQrSize
        : _minimumTextWidth;
    final previousWidth = _clamp(element.width, minimumWidth, 1.0);
    final minimumHeight = element.type == 'qr'
        ? ticketTemplateMinQrSize
        : _minimumTextHeight;
    final previousHeight = _clamp(element.height, minimumHeight, 1.0);
    final fontSize = _clamp(
      element.fontSize,
      ticketTemplateMinFontSize,
      ticketTemplateMaxFontSize,
    );
    var width = previousWidth;
    var height = previousHeight;
    var x = _clamp(element.x, 0.0, 1.0 - previousWidth);
    var y = _clamp(element.y, 0.0, 1.0 - previousHeight);
    if (element.type != 'qr') {
      // For text elements, use the persisted width/height directly if they
      // are above the minimum. Only fall back to intrinsic measurement for
      // elements that have never been freely resized.
      final intrinsic = _intrinsicTextGeometry(
        element.copyWith(fontSize: fontSize),
      );
      width = _clamp(
        math.max(previousWidth, intrinsic.width),
        minimumWidth,
        _maximumTextWidth,
      );
      height = _clamp(
        math.max(previousHeight, intrinsic.height),
        minimumHeight,
        _maximumTextHeight,
      );
      x = _clamp(x, 0.0, 1.0 - width);
      y = _clamp(y, 0.0, 1.0 - height);
    }
    return element.copyWith(
      x: x,
      y: y,
      width: width,
      height: height,
      fontSize: fontSize,
    );
  }

  Size _intrinsicTextGeometry(TicketTemplateElementModel element) {
    final painter = TextPainter(
      text: TextSpan(
        text: _elementLabel(element),
        style: TextStyle(
          fontSize: element.fontSize,
          fontWeight: FontWeight.w700,
        ),
      ),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: ticketTemplateCanvasWidth * 0.9);
    final canonicalCanvasHeight =
        ticketTemplateCanvasWidth / _backgroundAspectRatio;
    return Size(
      _clamp(
        (painter.width + _textHorizontalPadding) / ticketTemplateCanvasWidth,
        _minimumTextWidth,
        _maximumTextWidth,
      ),
      _clamp(
        (painter.height + _textVerticalPadding) / canonicalCanvasHeight,
        _minimumTextHeight,
        _maximumTextHeight,
      ),
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
        return 'Ticket Code';
      case 'name':
        return 'Name';
      case 'email':
        return 'Email';
      case 'event_name':
        return 'Event Name';
      default:
        return 'Element';
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

    // ── Free-form text resize ─────────────────────────────────────────
    // Unlike the old "semantic" resize that only scaled font size, this
    // allows the user to freely resize the text bounding box (like in
    // Canva). Font size scales proportionally with the box height change.
    final dx = delta.dx / canvasSize.width;
    final dy = delta.dy / canvasSize.height;

    var newX = current.x;
    var newY = current.y;
    var newWidth = current.width;
    var newHeight = current.height;

    switch (handle) {
      case _ResizeHandle.bottomRight:
        newWidth = current.width + dx;
        newHeight = current.height + dy;
      case _ResizeHandle.topLeft:
        newX = current.x + dx;
        newY = current.y + dy;
        newWidth = current.width - dx;
        newHeight = current.height - dy;
      case _ResizeHandle.topRight:
        newY = current.y + dy;
        newWidth = current.width + dx;
        newHeight = current.height - dy;
      case _ResizeHandle.bottomLeft:
        newX = current.x + dx;
        newWidth = current.width - dx;
        newHeight = current.height + dy;
    }

    // Clamp dimensions
    newWidth = _clamp(newWidth, _minimumTextWidth, _maximumTextWidth);
    newHeight = _clamp(newHeight, _minimumTextHeight, _maximumTextHeight);

    // Ensure element stays within canvas
    newX = _clamp(newX, 0.0, 1.0 - newWidth);
    newY = _clamp(newY, 0.0, 1.0 - newHeight);

    // Scale font proportionally to height change ratio
    final heightRatio = newHeight / current.height;
    final fontSize = _clamp(
      current.fontSize * heightRatio,
      ticketTemplateMinFontSize,
      ticketTemplateMaxFontSize,
    );

    setState(() {
      _selectedIndex = index;
      _dirty = true;
      _elements[index] = current.copyWith(
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
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
    final currentRect = _elementRect(current, canvasSize);
    final currentLeft = currentRect.left;
    final currentTop = currentRect.top;
    final currentRight = currentRect.right;
    final currentBottom = currentRect.bottom;
    final currentSize = currentRect.width;
    final signedDelta = switch (handle) {
      _ResizeHandle.bottomRight => math.max(delta.dx, delta.dy),
      _ResizeHandle.topLeft => math.max(-delta.dx, -delta.dy),
      _ResizeHandle.topRight => math.max(delta.dx, -delta.dy),
      _ResizeHandle.bottomLeft => math.max(-delta.dx, delta.dy),
    };
    final minSize =
        ticketTemplateMinQrSize * math.min(canvasSize.width, canvasSize.height);
    final maxSize = math.min(
      ticketTemplateMaxQrSize * math.min(canvasSize.width, canvasSize.height),
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
      final draft = TicketTemplateElementModel(
        type: type,
        x: 0.12,
        y: y,
        width: 0.20,
        height: 0.08,
        fontSize: ticketTemplateDefaultFontSize,
      );
      final intrinsic = _intrinsicTextGeometry(draft);
      _elements.add(
        _normalizeElement(
          draft.copyWith(width: intrinsic.width, height: intrinsic.height),
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
            .clamp(1.0, 200.0)
            .toDouble();

    final outerInset = selected ? _selectionInset : 0.0;
    return Positioned(
      left: rect.left - outerInset,
      top: rect.top - outerInset,
      width: rect.width + outerInset * 2,
      height: rect.height + outerInset * 2,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fromRect(
            rect: Rect.fromLTWH(
              outerInset,
              outerInset,
              rect.width,
              rect.height,
            ),
            child: GestureDetector(
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
                      ? Border.all(color: _selectionColor, width: 1.5)
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
                          maxLines: 1,
                          overflow: TextOverflow.visible,
                          style: TextStyle(
                            color: _colorFromHex(element.color),
                            fontWeight: FontWeight.w700,
                            fontSize: fontSize,
                          ),
                        ),
                ),
              ),
            ),
          ),
          if (selected)
            ..._ResizeHandle.values.map(
              (handle) =>
                  _buildResizeHandle(index, handle, canvasSize, rect.size),
            ),
        ],
      ),
    );
  }

  Widget _buildResizeHandle(
    int index,
    _ResizeHandle handle,
    Size canvasSize,
    Size elementSize,
  ) {
    final isBottomRight = handle == _ResizeHandle.bottomRight;
    final keyName = isBottomRight
        ? 'ticket-template-resize-handle-$index'
        : 'ticket-template-resize-handle-$index-${handle.name}';
    final left = switch (handle) {
      _ResizeHandle.topLeft || _ResizeHandle.bottomLeft => 0.0,
      _ResizeHandle.topRight || _ResizeHandle.bottomRight => elementSize.width,
    };
    final top = switch (handle) {
      _ResizeHandle.topLeft || _ResizeHandle.topRight => 0.0,
      _ResizeHandle.bottomLeft ||
      _ResizeHandle.bottomRight => elementSize.height,
    };
    return Positioned(
      left: left - _resizeHandleTouchPadding,
      top: top - _resizeHandleTouchPadding,
      child: GestureDetector(
        key: ValueKey(keyName),
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) => _select(index),
        onPanUpdate: (details) =>
            _resizeElement(index, handle, details.delta, canvasSize),
        child: Padding(
          padding: const EdgeInsets.all(_resizeHandleTouchPadding),
          child: Container(
            width: _resizeHandleDiameter,
            height: _resizeHandleDiameter,
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: _selectionColor, width: 2.0),
              shape: BoxShape.circle,
              boxShadow: const [
                BoxShadow(
                  color: Colors.black26,
                  blurRadius: 3,
                  offset: Offset(0, 1),
                ),
              ],
            ),
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
                              'Background image could not be loaded',
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
                              'Drag elements to move. Pull corners to resize.',
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
                  color: selected ? _selectionColor : Colors.black38,
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
                        'Selected: ${_elementLabel(selectedElement)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (!required)
                      TextButton.icon(
                        key: const ValueKey('ticket-template-delete-element'),
                        onPressed: _removeSelectedElement,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Delete'),
                      )
                    else
                      const Text(
                        'Required',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
                if (selectedElement.type != 'qr') ...[
                  const SizedBox(height: 4),
                  const Text('Text color'),
                  const SizedBox(height: 6),
                  _buildColorPicker(),
                ] else
                  const Text('QR is required and always square.'),
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
                'Add element',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 40,
                child: _availableTokens.isEmpty
                    ? const Align(
                        alignment: Alignment.centerLeft,
                        child: Text('All optional elements are in use.'),
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
                title: const Text('Discard changes?'),
                content: const Text(
                  'Unsaved template changes will be lost.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text('Cancel'),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Discard'),
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
        const SnackBar(content: Text('QR and Ticket Code are required.')),
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
              'Ticket template could not be saved. Please try again.',
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
            tooltip: 'Back',
            onPressed: _handleBack,
            icon: const Icon(Icons.close),
          ),
          title: const Text('Edit Ticket Template'),
          actions: [
            TextButton(
              key: const ValueKey('ticket-template-editor-done'),
              onPressed: _isSaving ? null : _saveAndClose,
              child: Text(
                _isSaving ? 'Saving...' : 'Done',
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
