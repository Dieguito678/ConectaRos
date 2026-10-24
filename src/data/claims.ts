import type { Claim } from '../types/claim'

// Ejemplos inventados. No representan reportes ni intervenciones reales.
export const demoClaims: Claim[] = [
  { id: 'DEMO-001', title: 'Una cuadra que necesita más luz', category: 'alumbrado', neighborhood: 'Pichincha', address: 'Güemes al 2300', description: 'Dos luminarias de esta cuadra no encienden por la noche. Ejemplo ficticio para explorar el detalle de un reclamo.', status: 'En proceso', date: '2026-10-23' },
  { id: 'DEMO-002', title: 'Residuos junto al contenedor', category: 'residuos', neighborhood: 'Centro', address: 'San Juan al 1200', description: 'Se acumularon bolsas alrededor del contenedor. Situación inventada para esta demo.', status: 'Pendiente', date: '2026-10-23' },
  { id: 'DEMO-003', title: 'Bache en la esquina', category: 'baches', neighborhood: 'Echesortu', address: 'Mendoza y Cafferata', description: 'Un bache dificulta el paso de bicicletas y vehículos. Ejemplo ficticio, sin envío a organismos.', status: 'Pendiente', date: '2026-10-22' },
  { id: 'DEMO-004', title: 'Vereda reparada, paso más seguro', category: 'veredas', neighborhood: 'Abasto', address: 'Entre Ríos al 1900', description: 'Ejemplo de un reclamo con estado resuelto. No corresponde a una reparación real.', status: 'Resuelto', date: '2026-10-21' },
  { id: 'DEMO-005', title: 'Ramas sobre la senda peatonal', category: 'arbolado', neighborhood: 'Pichincha', address: 'Jujuy al 2400', description: 'Ramas bajas obstruyen parte de la vereda. Reclamo ficticio de arbolado urbano.', status: 'En proceso', date: '2026-10-21' },
  { id: 'DEMO-006', title: 'Pérdida de agua en la calle', category: 'agua', neighborhood: 'Fisherton', address: 'Eva Perón al 8000', description: 'Se observa agua sobre la calzada en este ejemplo inventado.', status: 'Pendiente', date: '2026-10-20' },
  { id: 'DEMO-007', title: 'Corte de suministro en la cuadra', category: 'electricidad', neighborhood: 'Alberdi', address: 'Bv. Rondeau al 2100', description: 'Ejemplo ficticio de una interrupción de electricidad en el barrio.', status: 'En proceso', date: '2026-10-20' },
  { id: 'DEMO-008', title: 'Consulta por suministro de gas', category: 'gas', neighborhood: 'Arroyito', address: 'Av. Alberdi al 900', description: 'Consulta inventada sobre el suministro de gas, incluida para mostrar la categoría.', status: 'Pendiente', date: '2026-10-19' },
  { id: 'DEMO-009', title: 'Cartel de la plaza deteriorado', category: 'otros', neighborhood: 'Centro', address: 'Plaza Sarmiento', description: 'Ejemplo ficticio de señalética deteriorada en un espacio público.', status: 'Resuelto', date: '2026-10-18' },
]
