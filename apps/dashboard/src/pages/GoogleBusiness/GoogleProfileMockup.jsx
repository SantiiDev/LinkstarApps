/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que la deja borrosa,
 * inerte y detrás de un modal que no se puede cerrar. NO agregar otro
 * importador: fuera de esa puerta es una pantalla inventando datos.
 *
 * Es la pantalla real (GoogleProfileScreen) dibujada con los mismos bloques
 * (GoogleProfileBlocks) y una ficha INVENTADA, así lo que se ve antes de conectar
 * es lo que se ve después. La protección de ficha (Business) va abierta aunque la
 * cuenta sea gratis, sin candado: detrás del modal de Google la sección se
 * muestra como la ve una cuenta Business. El candado aparece recién en la
 * pantalla real.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import { ProfileDetails, ProfileToolbar } from './GoogleProfileBlocks';
import { ProtectionPreview } from './GoogleProfileBusinessPreview';
import './GoogleBusiness.css';
import './GoogleProfile.css';

const time = (hours, minutes = 0) => ({ hours, minutes });
const open = (day, from, to) => ({ openDay: day, openTime: time(from), closeDay: day, closeTime: time(to) });

const attr = (name, displayName, group, value) => ({ name, displayName, group, valueType: 'BOOL', value });
const link = (name, displayName, uri) => ({ name, displayName, valueType: 'URL', uri });

const SAMPLE = {
  profile: {
    title: 'Café del Parque',
    address: 'Av. Siempreviva 742, Rosario, Santa Fe',
    openStatus: 'OPEN',
    description:
      'Cafetería de especialidad con tostado propio. Desayunos, almuerzos livianos y meriendas, con opciones sin TACC y patio al aire libre.',
    primaryPhone: '0341 555-0000',
    additionalPhones: ['0341 555-0001'],
    websiteUri: 'https://cafedelparque.com.ar',
    regularHours: {
      periods: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((d) => open(d, 8, 20))
        .concat([open('SATURDAY', 9, 21)]),
    },
    primaryCategory: 'Cafetería',
    additionalCategories: ['Tienda de café', 'Panadería'],
  },
  attributes: [
    link('attributes/url_whatsapp', 'WhatsApp', 'https://wa.me/543415550000'),
    link('attributes/url_instagram', 'Instagram', 'https://instagram.com/cafedelparque'),
    link('attributes/url_facebook', 'Facebook', 'https://facebook.com/cafedelparque'),
    attr('attributes/has_wheelchair_accessible_entrance', 'Entrada accesible para silla de ruedas', 'Accesibilidad', true),
    attr('attributes/has_wheelchair_accessible_restroom', 'Sanitario accesible para silla de ruedas', 'Accesibilidad', false),
    attr('attributes/has_wheelchair_accessible_seating', 'Asientos accesibles para silla de ruedas', 'Accesibilidad', null),
    attr('attributes/has_seating_outdoors', 'Mesas al aire libre', 'Servicios', true),
    attr('attributes/has_takeout', 'Comida para llevar', 'Servicios', true),
    attr('attributes/welcomes_dogs', 'Se admiten perros', 'Servicios', null),
  ],
  attributesError: false,
};

const noop = () => {};

export default function GoogleProfileMockup() {
  return (
    <div className="gb-page">
      <PageHeader eyebrow="Google Business" title="Perfil de negocio" subtitle="Gestioná la información de tu ficha de Google" />

      <ProfileToolbar
        options={[{ value: 'sample', label: 'Café del Parque' }]}
        selected="sample"
        onSelect={noop}
        onEdit={noop}
      />

      <div className="gbp-card">
        <ProtectionPreview />
      </div>

      <ProfileDetails data={SAMPLE} />
    </div>
  );
}
