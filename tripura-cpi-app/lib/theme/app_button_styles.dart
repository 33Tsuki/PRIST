import 'package:flutter/material.dart';

class AppButtonStyles {
  static const BorderRadius _buttonRadius = BorderRadius.all(
    Radius.circular(14),
  );
  static const EdgeInsets _defaultPadding = EdgeInsets.symmetric(
    horizontal: 18,
    vertical: 16,
  );
  static const EdgeInsets _compactPadding = EdgeInsets.symmetric(
    horizontal: 12,
    vertical: 10,
  );
  static const Size _defaultMinSize = Size(96, 52);
  static const Size _compactMinSize = Size(72, 44);

  static const Color syncBackground = Color(0xFFD6E8D6);
  static const Color syncForeground = Color(0xFF1B4332);
  static const Color syncBorder = Color(0xFFBFD7BF);

  static const Color submitBackground = Color(0xFFD9E7F5);
  static const Color submitForeground = Color(0xFF1D3557);
  static const Color submitBorder = Color(0xFFC6D8EB);

  static const Color outlineForeground = Color(0xFF2C5282);
  static const Color outlineBorder = Color(0xFFD6DEE8);

  static const Color logoutForeground = Color(0xFFE55353);
  static const Color logoutBorder = Color(0xFFD6DEE8);

  static const Color softDangerBackground = Color(0xFFFBE3E3);
  static const Color softDangerForeground = Color(0xFF7F1D1D);
  static const Color softDangerBorder = Color(0xFFF4CACA);

  static const Color disabledBackground = Color(0xFFE5E7EB);
  static const Color disabledForeground = Color(0xFF9CA3AF);

  static ButtonStyle submitButton({
    EdgeInsetsGeometry padding = _defaultPadding,
  }) {
    return ElevatedButton.styleFrom(
      backgroundColor: submitBackground,
      foregroundColor: submitForeground,
      disabledBackgroundColor: disabledBackground,
      disabledForegroundColor: disabledForeground,
      elevation: 0,
      side: const BorderSide(color: submitBorder, width: 1),
      shape: const RoundedRectangleBorder(borderRadius: _buttonRadius),
      padding: padding,
      minimumSize: _defaultMinSize,
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
    );
  }

  static ButtonStyle syncButton({
    EdgeInsetsGeometry padding = _defaultPadding,
  }) {
    return ElevatedButton.styleFrom(
      backgroundColor: syncBackground,
      foregroundColor: syncForeground,
      disabledBackgroundColor: disabledBackground,
      disabledForegroundColor: disabledForeground,
      elevation: 0,
      side: const BorderSide(color: syncBorder, width: 1),
      shape: const RoundedRectangleBorder(borderRadius: _buttonRadius),
      padding: padding,
      minimumSize: _defaultMinSize,
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
    );
  }

  static ButtonStyle outlineButton({
    EdgeInsetsGeometry padding = _defaultPadding,
    Color foregroundColor = outlineForeground,
    Color borderColor = outlineBorder,
  }) {
    return OutlinedButton.styleFrom(
      backgroundColor: Colors.white,
      foregroundColor: foregroundColor,
      disabledForegroundColor: disabledForeground,
      side: BorderSide(color: borderColor, width: 1),
      shape: const RoundedRectangleBorder(borderRadius: _buttonRadius),
      padding: padding,
      minimumSize: _defaultMinSize,
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
    );
  }

  static ButtonStyle logoutOutlineButton({
    EdgeInsetsGeometry padding = _defaultPadding,
  }) => outlineButton(
        padding: padding,
        foregroundColor: logoutForeground,
        borderColor: logoutBorder,
      );

  static ButtonStyle softDangerButton({
    EdgeInsetsGeometry padding = _defaultPadding,
  }) {
    return ElevatedButton.styleFrom(
      backgroundColor: softDangerBackground,
      foregroundColor: softDangerForeground,
      disabledBackgroundColor: disabledBackground,
      disabledForegroundColor: disabledForeground,
      elevation: 0,
      side: const BorderSide(color: softDangerBorder, width: 1),
      shape: const RoundedRectangleBorder(borderRadius: _buttonRadius),
      padding: padding,
      minimumSize: _defaultMinSize,
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
    );
  }

  static ButtonStyle textButton({
    EdgeInsetsGeometry padding = _compactPadding,
  }) {
    return TextButton.styleFrom(
      backgroundColor: Colors.white,
      foregroundColor: submitForeground,
      side: const BorderSide(color: outlineBorder, width: 1),
      padding: padding,
      shape: const RoundedRectangleBorder(borderRadius: _buttonRadius),
      minimumSize: _compactMinSize,
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    );
  }

}
