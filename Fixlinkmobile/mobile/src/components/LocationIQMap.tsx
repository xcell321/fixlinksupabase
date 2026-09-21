import React, { useRef, useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { getLocationIqTileUrl } from '../screens/services/locationIq';

type LatLng = { latitude: number; longitude: number; name?: string; address?: string };

export interface LocationIQMapProps {
  technicianCoords?: LatLng | null;
  customerCoords?: LatLng | null;
  routeCoordinates?: number[][];
  currentUserRole?: string;
  isAccepted?: boolean;
  style?: StyleProp<ViewStyle>;
}

let WebView: unknown = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WebView = require('react-native-webview').WebView;
  } catch (err) {
    console.warn('react-native-webview not loaded:', err);
  }
}

export default function LocationIQMap({
  technicianCoords,
  customerCoords,
  routeCoordinates = [],
  currentUserRole = 'technician',
  isAccepted = false,
  style,
}: LocationIQMapProps): React.JSX.Element {
  const webViewRef = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const iframeRef = useRef<{ contentWindow?: { postMessage: (msg: unknown, target: string) => void } } | null>(null);
  const isWebFallback: boolean = Platform.OS === 'web' || !WebView;

  const runMapCommand = (command: Record<string, unknown>): void => {
    if (isWebFallback) {
      try {
        (iframeRef.current as unknown as { contentWindow?: { postMessage: (m: unknown, t: string) => void } })?.contentWindow?.postMessage(
          { source: 'fixlink-map-host', ...command },
          '*',
        );
      } catch {}
      return;
    }
    if (!webViewRef.current) return;
    const { type, ...rest } = command as { type: string; lat?: number; lng?: number; name?: string; address?: string; coords?: unknown };
    if (type === 'tech') {
      webViewRef.current.injectJavaScript(
        `if (typeof window.updateTechMarker === 'function') { window.updateTechMarker(${rest.lat}, ${rest.lng}, ${JSON.stringify(rest.name ?? 'Technician')}); }`,
      );
    } else if (type === 'customer') {
      webViewRef.current.injectJavaScript(
        `if (typeof window.updateCustomerMarker === 'function') { window.updateCustomerMarker(${rest.lat}, ${rest.lng}, ${JSON.stringify(rest.name ?? 'Customer')}, ${JSON.stringify(rest.address ?? '')}); }`,
      );
    } else if (type === 'route') {
      webViewRef.current.injectJavaScript(
        `if (typeof window.updateRoutePolyline === 'function') { window.updateRoutePolyline(${JSON.stringify(rest.coords)}); }`,
      );
    }
  };

  const pushCurrentMapState = (): void => {
    if (technicianCoords?.latitude && technicianCoords?.longitude) {
      runMapCommand({ type: 'tech', lat: technicianCoords.latitude, lng: technicianCoords.longitude, name: technicianCoords.name ?? 'Technician' });
    }
    if (customerCoords?.latitude && customerCoords?.longitude) {
      runMapCommand({
        type: 'customer',
        lat: customerCoords.latitude,
        lng: customerCoords.longitude,
        name: customerCoords.name ?? 'Customer',
        address: customerCoords.address ?? '',
      });
    }
    if (routeCoordinates?.length) {
      runMapCommand({ type: 'route', coords: routeCoordinates });
    }
  };

  const initialCenterRef = useRef<number[] | null>(null);
  if (initialCenterRef.current === null) {
    if (currentUserRole === 'technician' && technicianCoords?.latitude && technicianCoords?.longitude) {
      initialCenterRef.current = [technicianCoords.latitude, technicianCoords.longitude];
    } else if (customerCoords?.latitude && customerCoords?.longitude) {
      initialCenterRef.current = [customerCoords.latitude, customerCoords.longitude];
    } else if (technicianCoords?.latitude && technicianCoords?.longitude) {
      initialCenterRef.current = [technicianCoords.latitude, technicianCoords.longitude];
    } else {
      initialCenterRef.current = [11.05, 124.005];
    }
  }
  const initialCenter: number[] = initialCenterRef.current!;

  const mapHtml: string = useMemo(() => {
    const tileUrl: string = getLocationIqTileUrl();
    const techLat: number | null = technicianCoords?.latitude ?? null;
    const techLng: number | null = technicianCoords?.longitude ?? null;
    const techName: string = technicianCoords?.name ? JSON.stringify(technicianCoords.name) : '"Technician"';
    const custLat: number | null = customerCoords?.latitude ?? null;
    const custLng: number | null = customerCoords?.longitude ?? null;
    const custName: string = customerCoords?.name ? JSON.stringify(customerCoords.name) : '"Customer"';
    const custAddress: string = customerCoords?.address ? JSON.stringify(customerCoords.address) : '""';
    const isTech: boolean = currentUserRole === 'technician';
    const canLocateOther: boolean = Boolean(isAccepted);
    const routeJson: string = JSON.stringify(routeCoordinates ?? []);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body, #map { width: 100%; height: 100%; overflow: hidden; background: #eef2f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .pulse-wrapper { position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
          .pulse-ring { position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(15, 118, 110, 0.35); animation: pulse-animation 1.8s infinite ease-out; }
          .pulse-dot { position: relative; z-index: 2; width: 32px; height: 32px; border-radius: 50%; background: #0F766E; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
          .pulse-dot svg { width: 16px; height: 16px; display: block; }
          .pulse-inner { width: 10px; height: 10px; border-radius: 50%; background: #ffffff; opacity: 0.95; }
          .customer-pin-wrapper { position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; }
          .customer-pin { width: 34px; height: 34px; border-radius: 50%; background: #D97706; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
          .customer-pin svg { width: 16px; height: 16px; display: block; }
          .customer-pin-dot { width: 10px; height: 10px; border-radius: 50%; background: #ffffff; opacity: 0.98; }
          @keyframes pulse-animation { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
          .leaflet-popup-content-wrapper { border-radius: 12px; padding: 4px; box-shadow: 0 6px 16px rgba(0,0,0,0.18); }
          .custom-popup { font-size: 13px; color: #102A43; line-height: 1.4; }
          .custom-popup strong { display: block; font-size: 14px; margin-bottom: 3px; }
          .custom-popup .subtext { color: #3F5A6E; font-size: 11px; }
          .map-watermark { position: absolute; bottom: 8px; right: 8px; background: rgba(255,255,255,0.85); padding: 3px 7px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #486581; z-index: 1000; pointer-events: none; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        </style>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      </head>
      <body>
        <div id="map"></div>
        <div class="map-watermark">LocationIQ Maps</div>
        <script>
          const initialCenter = [${initialCenter[0]}, ${initialCenter[1]}];
          const map = L.map('map', { center: initialCenter, zoom: 14, zoomControl: false, attributionControl: false });
          L.tileLayer('${tileUrl}', { maxZoom: 19, subdomains: 'abc' }).addTo(map);
          L.control.zoom({ position: 'bottomleft' }).addTo(map);
          let techMarker = null; let custMarker = null; let routePolyline = null;
          const techIcon = L.divIcon({ className: 'custom-div-icon', html: '<div class="pulse-wrapper"><div class="pulse-ring"></div><div class="pulse-dot"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/><path d="M5 21l1.5-4.5"/><path d="M9 14l1 1"/></svg></div></div>', iconSize: [44, 44], iconAnchor: [22, 22] });
          const custIcon = L.divIcon({ className: 'custom-div-icon', html: '<div class="customer-pin-wrapper"><div class="customer-pin"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></div></div>', iconSize: [42, 42], iconAnchor: [21, 21] });
          const isAccepted = ${canLocateOther ? 'true' : 'false'}; const isCurrentUserTech = ${isTech ? 'true' : 'false'};
          const techCoords = ${techLat && techLng ? `[${techLat}, ${techLng}]` : 'null'}; const custCoords = ${custLat && custLng ? `[${custLat}, ${custLng}]` : 'null'}; const rawRoute = ${routeJson};
          if (techCoords && (isCurrentUserTech || isAccepted)) { techMarker = L.marker(techCoords, { icon: techIcon }).addTo(map); const label = isCurrentUserTech ? "You (Technician)" : ("Technician: " + ${techName}); techMarker.bindPopup('<div class="custom-popup"><strong>' + label + '</strong><span class="subtext">Live Location</span></div>'); }
          if (custCoords && (!isCurrentUserTech || isAccepted)) { custMarker = L.marker(custCoords, { icon: custIcon }).addTo(map); const custLabel = !isCurrentUserTech ? "Your Location" : ("Customer: " + ${custName}); const addrHtml = ${custAddress} ? '<br><span class="subtext">' + ${custAddress} + '</span>' : ''; custMarker.bindPopup('<div class="custom-popup"><strong>' + custLabel + '</strong>' + addrHtml + '</div>'); }
          if (isAccepted && rawRoute && rawRoute.length > 0) { routePolyline = L.polyline(rawRoute, { color: '#0F766E', weight: 5, opacity: 0.85, smoothFactor: 1 }).addTo(map); }
          window.fitMarkers = function() { try { const bounds = []; if (techMarker && (isCurrentUserTech || isAccepted)) bounds.push(techMarker.getLatLng()); if (custMarker && (!isCurrentUserTech || isAccepted)) bounds.push(custMarker.getLatLng()); if (routePolyline && routePolyline.getLatLngs().length > 0) { map.fitBounds(routePolyline.getBounds(), { padding: [45, 45], maxZoom: 16 }); } else if (bounds.length > 1) { map.fitBounds(L.latLngBounds(bounds), { padding: [55, 55], maxZoom: 16 }); } else if (bounds.length === 1) { map.setView(bounds[0], 15); } } catch (err) {} };
          setTimeout(window.fitMarkers, 350);
          window.updateCustomerMarker = function(lat, lng, name, address) { try { const latLng = [lat, lng]; if (!custMarker) { custMarker = L.marker(latLng, { icon: custIcon }).addTo(map); window.fitMarkers(); } else { custMarker.setLatLng(latLng); } const custLabel = !isCurrentUserTech ? "Your Location" : ("Customer: " + (name || "Customer")); const addrHtml = address ? '<br><span class="subtext">' + address + '</span>' : ''; custMarker.bindPopup('<div class="custom-popup"><strong>' + custLabel + '</strong>' + addrHtml + '</div>'); } catch (err) {} };
          window.updateTechMarker = function(lat, lng, name) { try { const latLng = [lat, lng]; if (!techMarker) { techMarker = L.marker(latLng, { icon: techIcon }).addTo(map); window.fitMarkers(); } else { techMarker.setLatLng(latLng); } const label = isCurrentUserTech ? "You (Technician)" : ("Technician: " + (name || "Technician")); techMarker.bindPopup('<div class="custom-popup"><strong>' + label + '</strong><span class="subtext">Live Location</span></div>'); } catch (err) {} };
          window.updateRoutePolyline = function(coords) { try { if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; } if (coords && coords.length > 0) { routePolyline = L.polyline(coords, { color: '#0F766E', weight: 5, opacity: 0.85, smoothFactor: 1 }).addTo(map); } } catch (err) {} };
          window.addEventListener('message', function (event) { const data = event.data || {}; if (!data || data.source !== 'fixlink-map-host') return; try { if (data.type === 'tech') { window.updateTechMarker(Number(data.lat), Number(data.lng), data.name); } else if (data.type === 'customer') { window.updateCustomerMarker(Number(data.lat), Number(data.lng), data.name, data.address); } else if (data.type === 'route') { window.updateRoutePolyline(data.coords); } } catch (err) {} });
        </script>
      </body>
      </html>
    `;
  }, [initialCenter, customerCoords, technicianCoords, currentUserRole, isAccepted, routeCoordinates]);

  useEffect(() => {
    if (technicianCoords?.latitude && technicianCoords?.longitude) {
      runMapCommand({ type: 'tech', lat: technicianCoords.latitude, lng: technicianCoords.longitude, name: technicianCoords.name ?? 'Technician' });
    }
  }, [technicianCoords?.latitude, technicianCoords?.longitude, technicianCoords?.name]);

  useEffect(() => {
    if (customerCoords?.latitude && customerCoords?.longitude) {
      runMapCommand({ type: 'customer', lat: customerCoords.latitude, lng: customerCoords.longitude, name: customerCoords.name ?? 'Customer', address: customerCoords.address ?? '' });
    }
  }, [customerCoords?.latitude, customerCoords?.longitude, customerCoords?.name, customerCoords?.address]);

  useEffect(() => {
    if (routeCoordinates) {
      runMapCommand({ type: 'route', coords: routeCoordinates });
    }
  }, [routeCoordinates]);

  if (isWebFallback) {
    return (
      <View style={[styles.container, style]}>
        {/* @ts-ignore web iframe */}
        <iframe
          title="LocationIQ Map"
          srcDoc={mapHtml}
          ref={iframeRef as never}
          onLoad={() => pushCurrentMapState()}
          style={{ width: '100%', height: '100%', border: 'none' } as unknown as never}
        />
      </View>
    );
  }

  const WV = WebView as unknown as React.ComponentType<Record<string, unknown>>;
  return (
    <View style={[styles.container, style]}>
      <WV
        ref={webViewRef as never}
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0F766E" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%', backgroundColor: '#EEF2F5', overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  loadingContainer: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F8FA' } as const,
});
