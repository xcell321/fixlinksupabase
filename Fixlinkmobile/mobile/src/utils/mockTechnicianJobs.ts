import type { JobItem } from './availableJobsHelpers.ts';

export function getPrototypeMockJobs(): JobItem[] {
  return [
    {
      id: 'proto-job-101',
      status: 'Pending',
      applianceType: 'Samsung Inverter Refrigerator (RT22FARBD)',
      customerName: 'Maria Santos',
      location: 'San Vicente, Bogo City',
      distanceKm: 1.8,
      description: 'Freezer compartment freezes normally but lower fresh food compartment stays warm. Continuous clicking sound audible from the rear compressor unit.',
      preferredDate: 'Today',
      preferredTime: '2:30 PM',
      scheduledDate: new Date().toISOString(),
      photoUrl: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=800&q=80',
      urgency: 'urgent',
      estimatedPayout: 'PHP 650 to 900'
    },
    {
      id: 'proto-job-102',
      status: 'Pending',
      applianceType: 'Carrier Split Aircon (1.5 HP Inverter)',
      customerName: 'Danilo Lim',
      location: 'Lourdes, Bogo City',
      distanceKm: 3.4,
      description: 'Water drips continuously from indoor evaporator casing down to bedroom floor. Fan runs but airflow temperature is not cold.',
      preferredDate: 'Today',
      preferredTime: '4:00 PM',
      scheduledDate: new Date().toISOString(),
      photoUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
      urgency: 'urgent',
      estimatedPayout: 'PHP 800 to 1,200'
    },
    {
      id: 'proto-job-103',
      status: 'Pending',
      applianceType: 'LG Smart Inverter Washing Machine (8.5kg)',
      customerName: 'Rowena Alcantara',
      location: 'Poblacion, Medellin Catchment',
      distanceKm: 5.6,
      description: 'Error code OE shows on control panel during rinse and spin cycles. Drum does not drain water. Pump hums steadily without evacuation.',
      preferredDate: 'Tomorrow',
      preferredTime: '9:30 AM',
      scheduledDate: new Date(Date.now() + 86400000).toISOString(),
      photoUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=800&q=80',
      urgency: 'normal',
      estimatedPayout: 'PHP 550 to 850'
    },
    {
      id: 'proto-job-104',
      status: 'Pending',
      applianceType: 'Desktop Workstation Computer (System Unit)',
      customerName: 'Kenneth Tan',
      location: 'Taytayan, Bogo City',
      distanceKm: 2.2,
      description: 'Power button turns on fans and motherboards LEDs at full speed, but no signal reaches external displays. 3 short beeps emit on startup.',
      preferredDate: 'Tomorrow',
      preferredTime: '11:00 AM',
      scheduledDate: new Date(Date.now() + 86400000).toISOString(),
      photoUrl: null,
      urgency: 'normal',
      estimatedPayout: 'PHP 500 to 800'
    }
  ];
}

export function getPrototypeActiveJobs(): JobItem[] {
  return [
    {
      id: 'proto-active-201',
      status: 'In Progress',
      applianceType: 'Panasonic Window Air Conditioner (1.0 HP)',
      customerName: 'Elena Gonzaga',
      location: 'Barangay Cogon, Bogo City (Near Central School)',
      distanceKm: 1.2,
      description: 'General chemical cleaning and system refrigerant check. Unit was short cycling and blowing lukewarm air.',
      preferredDate: 'Today',
      preferredTime: '1:00 PM',
      scheduledDate: new Date().toISOString(),
      technicianArrivalAt: new Date(Date.now() - 1800000).toISOString(),
      photoUrl: null,
      urgency: 'urgent',
      estimatedPayout: 'PHP 750'
    }
  ];
}
