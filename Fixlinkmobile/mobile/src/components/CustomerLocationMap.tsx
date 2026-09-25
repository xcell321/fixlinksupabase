import React from 'react';
import LocationIQMap from './LocationIQMap';

type LatLng = { latitude: number; longitude: number; name?: string; address?: string };

// Customer-only wrapper - isolated from Technician map
// If this crashes, Technician map stays unaffected
export interface CustomerLocationMapProps {
  customerCoords?: LatLng | null;
  routeCoordinates?: number[][];
  isAccepted?: boolean;
  style?: any;
}

export default function CustomerLocationMap(props: CustomerLocationMapProps): React.JSX.Element {
  return (
    <LocationIQMap
      customerCoords={props.customerCoords}
      routeCoordinates={props.routeCoordinates}
      isAccepted={props.isAccepted}
      currentUserRole="customer"
      style={props.style}
    />
  );
}
