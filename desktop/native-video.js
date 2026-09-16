'use strict';
const koffi=require('koffi');
const user32=koffi.load('user32.dll');
const rect=koffi.struct('TShowRect',{left:'int',top:'int',right:'int',bottom:'int'});
const find=user32.func('uintptr_t __stdcall FindWindowExW(uintptr_t parent, uintptr_t after, const char16_t *className, const char16_t *title)');
const position=user32.func('bool __stdcall SetWindowPos(uintptr_t window, uintptr_t after, int x, int y, int width, int height, uint flags)');
const show=user32.func('bool __stdcall ShowWindow(uintptr_t window, int command)');
const client=user32.func('bool __stdcall GetClientRect(uintptr_t window, _Out_ TShowRect *rect)');
const create=user32.func('uintptr_t __stdcall CreateWindowExW(uint exStyle, const char16_t *className, const char16_t *title, uint style, int x, int y, int width, int height, uintptr_t parent, uintptr_t menu, uintptr_t instance, void *param)');
const destroy=user32.func('bool __stdcall DestroyWindow(uintptr_t window)');
const point=koffi.struct('TShowPoint',{x:'long',y:'long'});
const screenPoint=user32.func('bool __stdcall ClientToScreen(uintptr_t window, _Inout_ TShowPoint *point)');
const dpi=user32.func('uint __stdcall GetDpiForWindow(uintptr_t window)');
function handle(window){const b=window.getNativeWindowHandle();return b.length===8?b.readBigUInt64LE(0):b.readUInt32LE(0);}
class NativeSurface {
 constructor(window){
  this.parent=handle(window);this.window=window;
  this.hwnd=create(0x80,'STATIC','TShow video',(0x80000000|0x02000000|0x04000000)>>>0,0,0,1,1,this.parent,0,0,null);
  if(!this.hwnd)throw Error('Windows could not create the video surface.');
 }
 isDestroyed(){return !this.hwnd;}
 getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(this.hwnd));return b;}
 setBounds(){if(!this.hwnd)return;const bounds={};client(this.parent,bounds);const scale=(dpi(this.parent)||96)/96;const origin={x:0,y:Math.round(82*scale)};screenPoint(this.parent,origin);position(this.hwnd,0,origin.x,origin.y,bounds.right,Math.max(1,bounds.bottom-Math.round(224*scale)),0x0010);if(this.visible)revealVideo(this);}
 showInactive(){if(!this.hwnd)return;this.visible=true;show(this.hwnd,5);this.setBounds();revealVideo(this);}
 hide(){this.visible=false;if(this.hwnd)show(this.hwnd,0);}
 destroy(){if(this.hwnd)destroy(this.hwnd);this.hwnd=0;}
}
// Both handles originate in the main process; web content cannot target other windows.
function revealVideo(surface){
 if(surface.isDestroyed())return false;
 const parent=handle(surface),video=find(parent,0,'mpv',null);if(!video)return false;
 const bounds={};if(!client(parent,bounds))return false;
 show(video,5);return position(video,0,0,0,bounds.right,bounds.bottom,0x0040|0x0010);
}
module.exports={NativeSurface,revealVideo};
