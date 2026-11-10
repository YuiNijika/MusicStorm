#pragma once

#include <windows.h>

enum class KSMWindowResizeDirection {
  Top,
  Bottom,
  Left,
  Right,
  TopLeft,
  TopRight,
  BottomLeft,
  BottomRight
};

class KSMWindowFrame final {
public:
  KSMWindowFrame() = delete;

  static bool Configure(
      HWND window,
      bool decorations,
      bool resizable = true,
      int min_width = 320,
      int min_height = 240,
      int max_width = 0,
      int max_height = 0
  );
  static bool IsFrameless(HWND window);
  static bool StartDrag(HWND window);
  static bool StartResize(
      HWND window,
      KSMWindowResizeDirection direction
  );
  static void RefreshResizeHitTesting(HWND window);

private:
  static void SubclassDescendants(HWND frame, HWND parent);

  static LRESULT CALLBACK ChildSubclassProc(
      HWND window,
      UINT message,
      WPARAM wparam,
      LPARAM lparam,
      UINT_PTR subclass_id,
      DWORD_PTR reference
  );
  static LRESULT CALLBACK SubclassProc(
      HWND window,
      UINT message,
      WPARAM wparam,
      LPARAM lparam,
      UINT_PTR subclass_id,
      DWORD_PTR reference
  );
};
