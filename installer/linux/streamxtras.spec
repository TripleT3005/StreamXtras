%global debug_package %{nil}

Name: streamxtras
Version: APP_VERSION
Release: 1
Summary: Self-hosted chat box, alerts and more for OBS
License: MIT
URL: https://github.com/TripleT3005/StreamXtras
Recommends: espeak-ng

%description
A small companion app runs in the system tray, serves stream overlays
(chat box, alerts, goals, recent events, top emotes) and a settings page
on 127.0.0.1 and connects them to Twitch.

%install
cp -a %{_sourcedir}/root/. %{buildroot}/

%files
%{_bindir}/streamxtras
%{_datadir}/streamxtras
%{_datadir}/applications/streamxtras.desktop
%{_datadir}/icons/hicolor/*/apps/streamxtras.*
%{_docdir}/streamxtras
