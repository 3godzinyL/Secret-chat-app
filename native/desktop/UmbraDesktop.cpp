// Native Windows control launcher for UMBRA. This is a C++ desktop entry point,
// not a claim that HTML/CSS/JS of the web client is concealed or compiled away.
// MSVC: cl /nologo /std:c++20 /EHsc /O2 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN ...
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <filesystem>
#include <string>
#include <tuple>
#pragma comment(lib,"user32.lib")
#pragma comment(lib,"gdi32.lib")
#pragma comment(lib,"shell32.lib")
namespace fs=std::filesystem;
namespace {
HBRUSH bg=nullptr;
HFONT titleFont=nullptr,detailFont=nullptr;
fs::path root;
HWND statusControl=nullptr;
constexpr COLORREF background=RGB(9,7,14), panel=RGB(22,15,33), purple=RGB(110,60,180);
void setStatus(const wchar_t* text){if(statusControl)SetWindowTextW(statusControl,text);}
std::wstring quoted(const std::wstring& v){return L"\""+v+L"\"";}
bool findRoot(){
 wchar_t full[MAX_PATH]={};if(!GetModuleFileNameW(nullptr,full,MAX_PATH))return false;
 auto base=fs::path(full).parent_path();
 for(int i=0;i<7;i++){
  if(fs::exists(base/L"server"/L"index.js")){root=base;return true;}
  if(!base.has_parent_path())break;base=base.parent_path();
 }
 return false;
}
void browser(const std::wstring& dest){ShellExecuteW(nullptr,L"open",dest.c_str(),nullptr,nullptr,SW_SHOWNORMAL);}
void launch(const std::wstring& mode){
 if(root.empty()){MessageBoxW(nullptr,L"Nie znaleziono folderu UMBRA/server.",L"UMBRA",MB_ICONERROR);return;}
 std::wstring cmd=L"node.exe "+quoted((root/L"scripts"/L"launch.mjs").wstring())+L" "+mode;
 STARTUPINFOW si{};si.cb=sizeof(si);PROCESS_INFORMATION pi{};
 std::wstring dir=root.wstring();
 if(!CreateProcessW(nullptr,cmd.data(),nullptr,nullptr,FALSE,CREATE_NEW_CONSOLE,nullptr,dir.c_str(),&si,&pi)){
  MessageBoxW(nullptr,L"Node.js nie uruchomił się. Sprawdź PATH i instalację Node.js 20+.",L"UMBRA",MB_ICONERROR);return;
 }
 CloseHandle(pi.hThread);CloseHandle(pi.hProcess);
 setStatus(mode==L"ngrok"?L"Uruchamianie serwera i ngrok w osobnej konsoli...":L"Uruchamianie serwera w osobnej konsoli...");
}
LRESULT CALLBACK wndProc(HWND hwnd,UINT msg,WPARAM w,LPARAM l){
 switch(msg){
 case WM_CREATE:{
  titleFont=CreateFontW(37,0,0,0,FW_BOLD,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
  detailFont=CreateFontW(16,0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
  auto text=[&](const wchar_t* t,int y,int height,HFONT font){HWND h=CreateWindowW(L"STATIC",t,WS_CHILD|WS_VISIBLE,30,y,570,height,hwnd,nullptr,nullptr,nullptr);SendMessageW(h,WM_SETFONT,(WPARAM)font,TRUE);return h;};
  text(L"UMBRA",33,56,titleFont);
  text(L"PRIVATE WORKSPACE   /   NATIVE CONTROL",89,35,detailFont);
  text(L"Serwer, aplikacja i tunel dostępne jednym kliknięciem.",139,34,detailFont);
  for(const auto& b: {std::tuple<int,const wchar_t*,int>{1,L"LOCAL — Uruchom",205}, {2,L"NGROK — Udostępnij HTTPS",266}, {3,L"Otwórz komunikator",327}}){
   auto [id,caption,y]=b;
   HWND h=CreateWindowW(L"BUTTON",caption,WS_CHILD|WS_VISIBLE|BS_OWNERDRAW,30,y,540,48,hwnd,(HMENU)(INT_PTR)id,nullptr,nullptr);
   SendMessageW(h,WM_SETFONT,(WPARAM)detailFont,TRUE);
  }
  statusControl=text(L"Gotowy do uruchomienia.  /k/67767",404,25,detailFont);
  return 0;
 }
 case WM_COMMAND:{
  int id=LOWORD(w);if(id==1)launch(L"local");else if(id==2)launch(L"ngrok");else if(id==3)browser(L"http://127.0.0.1:3000/k/67767");return 0;
 }
 case WM_DRAWITEM:{
  auto* d=(DRAWITEMSTRUCT*)l;RECT r=d->rcItem;
  HBRUSH fill=CreateSolidBrush(d->CtlID==1?purple:(d->CtlID==2?RGB(65,36,103):panel));FillRect(d->hDC,&r,fill);DeleteObject(fill);
  FrameRect(d->hDC,&r,(HBRUSH)GetStockObject(GRAY_BRUSH));SetBkMode(d->hDC,TRANSPARENT);SetTextColor(d->hDC,RGB(238,222,255));
  wchar_t t[150]={};GetWindowTextW(d->hwndItem,t,150);SelectObject(d->hDC,detailFont);
  DrawTextW(d->hDC,t,-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);
  if(d->itemState&ODS_FOCUS)DrawFocusRect(d->hDC,&r);
  return TRUE;
 }
 case WM_CTLCOLORSTATIC:{
  HDC dc=(HDC)w;SetTextColor(dc,RGB(219,199,239));SetBkMode(dc,TRANSPARENT);return (LRESULT)bg;
 }
 case WM_ERASEBKGND:{RECT r;GetClientRect(hwnd,&r);FillRect((HDC)w,&r,bg);return 1;}
 case WM_DESTROY:DeleteObject(titleFont);DeleteObject(detailFont);DeleteObject(bg);PostQuitMessage(0);return 0;
 }
 return DefWindowProcW(hwnd,msg,w,l);
}
}
int WINAPI wWinMain(HINSTANCE h,HINSTANCE,LPWSTR,int show){
 findRoot();bg=CreateSolidBrush(background);
 WNDCLASSEXW wc{};wc.cbSize=sizeof(wc);wc.hInstance=h;wc.lpszClassName=L"UmbraNativeControl";wc.lpfnWndProc=wndProc;wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hIcon=LoadIconW(nullptr,IDI_APPLICATION);
 if(!RegisterClassExW(&wc))return 1;
 HWND win=CreateWindowExW(0,wc.lpszClassName,L"UMBRA 3.0 — Native C++ Launcher",WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,CW_USEDEFAULT,CW_USEDEFAULT,618,510,nullptr,nullptr,h,nullptr);
 if(!win)return 2;ShowWindow(win,show);UpdateWindow(win);
 MSG msg{};while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}return(int)msg.wParam;
}
