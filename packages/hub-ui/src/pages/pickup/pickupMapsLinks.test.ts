import { describe, expect, it } from 'vitest';
import {
  buildAppleMapsUrl,
  buildExternalMapsLinks,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsRouteOrStopUrl,
  buildGoogleMapsSingleStopUrl,
  buildWazeUrl,
  pointToMapsQuery,
  stopToMapPoint,
} from './pickupMapsLinks';

describe('pickupMapsLinks', () => {
  describe('pointToMapsQuery', () => {
    it('prioriza lat/lng', () => {
      expect(pointToMapsQuery({ lat: -23.5, lng: -46.6, address: 'Rua X' })).toBe('-23.5,-46.6');
    });

    it('usa endereço textual quando não há coords', () => {
      expect(pointToMapsQuery({ address: 'Rua A, 10, SP' })).toBe('Rua A, 10, SP');
    });

    it('retorna null para ponto vazio', () => {
      expect(pointToMapsQuery({})).toBeNull();
      expect(pointToMapsQuery({ lat: NaN, lng: -46, address: '  ' })).toBeNull();
    });
  });

  describe('buildGoogleMapsDirectionsUrl', () => {
    it('retorna null com menos de 2 pontos válidos', () => {
      expect(buildGoogleMapsDirectionsUrl([{ lat: 1, lng: 2 }])).toBeNull();
      expect(buildGoogleMapsDirectionsUrl([{ address: '' }, {}])).toBeNull();
    });

    it('monta origin + destination sem waypoints para 2 pontos', () => {
      const r = buildGoogleMapsDirectionsUrl([
        { lat: -23.1, lng: -46.1 },
        { lat: -23.2, lng: -46.2 },
      ]);
      expect(r).not.toBeNull();
      expect(r!.truncated).toBe(false);
      const u = new URL(r!.url);
      expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
      expect(u.searchParams.get('api')).toBe('1');
      expect(u.searchParams.get('origin')).toBe('-23.1,-46.1');
      expect(u.searchParams.get('destination')).toBe('-23.2,-46.2');
      expect(u.searchParams.get('travelmode')).toBe('driving');
      expect(u.searchParams.get('waypoints')).toBeNull();
    });

    it('inclui waypoints no meio para 5 pontos', () => {
      const r = buildGoogleMapsDirectionsUrl([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
        { lat: 4, lng: 4 },
      ]);
      expect(r).not.toBeNull();
      expect(r!.truncated).toBe(false);
      const u = new URL(r!.url);
      expect(u.searchParams.get('origin')).toBe('0,0');
      expect(u.searchParams.get('destination')).toBe('4,4');
      expect(u.searchParams.get('waypoints')).toBe('1,1|2,2|3,3');
    });

    it('trunca quando há mais de 10 intermediários e mantém o último destino', () => {
      // origin + 12 middle + dest = 14 pontos → middle truncated to 10
      const points = Array.from({ length: 14 }, (_, i) => ({ lat: i, lng: i }));
      const r = buildGoogleMapsDirectionsUrl(points);
      expect(r).not.toBeNull();
      expect(r!.truncated).toBe(true);
      const u = new URL(r!.url);
      expect(u.searchParams.get('origin')).toBe('0,0');
      expect(u.searchParams.get('destination')).toBe('13,13');
      const wp = u.searchParams.get('waypoints')!.split('|');
      expect(wp).toHaveLength(10);
      expect(wp[0]).toBe('1,1');
      expect(wp[9]).toBe('10,10');
    });

    it('aceita endereços textuais', () => {
      const r = buildGoogleMapsDirectionsUrl([
        { address: 'Clínica SP' },
        { address: 'Rua B, 20' },
      ]);
      expect(r).not.toBeNull();
      const u = new URL(r!.url);
      expect(u.searchParams.get('origin')).toBe('Clínica SP');
      expect(u.searchParams.get('destination')).toBe('Rua B, 20');
    });

    it('filtra pontos inválidos', () => {
      const r = buildGoogleMapsDirectionsUrl([
        { address: '' },
        { lat: 1, lng: 1 },
        {},
        { lat: 2, lng: 2 },
      ]);
      expect(r).not.toBeNull();
      const u = new URL(r!.url);
      expect(u.searchParams.get('origin')).toBe('1,1');
      expect(u.searchParams.get('destination')).toBe('2,2');
    });
  });

  describe('buildGoogleMapsSingleStopUrl', () => {
    it('monta link com destination', () => {
      const url = buildGoogleMapsSingleStopUrl({ lat: -23, lng: -46 });
      expect(url).not.toBeNull();
      const u = new URL(url!);
      expect(u.searchParams.get('destination')).toBe('-23,-46');
      expect(u.searchParams.get('travelmode')).toBe('driving');
    });

    it('retorna null sem ponto válido', () => {
      expect(buildGoogleMapsSingleStopUrl({})).toBeNull();
    });
  });

  describe('buildGoogleMapsRouteOrStopUrl', () => {
    it('com 1 ponto vira destino único', () => {
      const r = buildGoogleMapsRouteOrStopUrl([{ address: 'Rua Só' }]);
      expect(r?.url).toContain('destination=Rua+S%C3%B3');
      expect(r?.truncated).toBe(false);
    });

    it('com 2+ pontos monta direções', () => {
      const r = buildGoogleMapsRouteOrStopUrl([
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ]);
      expect(r).not.toBeNull();
      const u = new URL(r!.url);
      expect(u.searchParams.get('origin')).toBe('1,1');
      expect(u.searchParams.get('destination')).toBe('2,2');
    });
  });

  describe('buildWazeUrl / buildAppleMapsUrl', () => {
    it('Waze com coords', () => {
      expect(buildWazeUrl({ lat: -23.5, lng: -46.6 })).toBe(
        'https://waze.com/ul?ll=-23.5%2C-46.6&navigate=yes',
      );
    });

    it('Waze com endereço', () => {
      expect(buildWazeUrl({ address: 'Rua A, 10' })).toBe(
        'https://waze.com/ul?q=Rua%20A%2C%2010&navigate=yes',
      );
    });

    it('Apple Maps com destino', () => {
      const url = buildAppleMapsUrl({ lat: -23, lng: -46 });
      expect(url).toContain('maps.apple.com');
      expect(url).toContain('daddr=-23%2C-46');
    });

    it('buildExternalMapsLinks agrega os três', () => {
      const links = buildExternalMapsLinks({ lat: -23, lng: -46 });
      expect(links.google).toContain('google.com/maps');
      expect(links.waze).toContain('waze.com');
      expect(links.apple).toContain('maps.apple.com');
    });
  });

  describe('stopToMapPoint', () => {
    it('lê lat/lng e endereço do snapshot', () => {
      expect(
        stopToMapPoint({
          address_snapshot: {
            lat: -23.5,
            lng: -46.6,
            address_street: 'Rua X, 1',
            address_neighborhood: 'Centro',
            address_city: 'SP',
          },
        }),
      ).toEqual({
        lat: -23.5,
        lng: -46.6,
        address: 'Rua X, 1, Centro, SP',
      });
    });

    it('aceita lat/lng em string', () => {
      const p = stopToMapPoint({ address_snapshot: { lat: '-23.1', lng: '-46.2' } });
      expect(p.lat).toBe(-23.1);
      expect(p.lng).toBe(-46.2);
    });

    it('aceita latitude/longitude e monta rua com número', () => {
      const p = stopToMapPoint({
        address_snapshot: {
          latitude: '-23.2',
          longitude: '-46.3',
          street: 'Rua Y',
          street_number: '42',
          district: 'Centro',
          city: 'Campinas',
          state: 'SP',
        },
      });
      expect(p.lat).toBe(-23.2);
      expect(p.lng).toBe(-46.3);
      expect(p.address).toBe('Rua Y, 42, Centro, Campinas, SP');
    });
  });
});
