/*
 * MAQUETA DECORATIVA — no es la pantalla, es el fondo.
 *
 * Se renderiza ÚNICAMENTE como `children` de `GoogleGate`, que la deja borrosa,
 * inerte y detrás de un modal que no se puede cerrar. NO agregar otro
 * importador: fuera de esa puerta es una pantalla inventando datos.
 *
 * Es la pantalla real (GooglePostsScreen) dibujada con los mismos bloques
 * (GooglePostsBlocks) y publicaciones INVENTADAS, así lo que se ve antes de
 * conectar es lo que se ve después: el compositor en su primer paso y las
 * publicaciones recientes, sin vistas ni clics porque Google ya no los da. Se
 * muestra como la ve una cuenta Business aunque la cuenta sea gratis: sin el
 * banner del cupo mensual, que aparece recién en la pantalla real.
 */

import PageHeader from '../../components/PageHeader/PageHeader';
import Icon from '../../components/Icon/Icon';
import { ComposerHeader, PostTypePicker, PostsList, PostsToolbar } from './GooglePostsBlocks';
import { stepsFor } from './googlePostsModel';
import './GoogleBusiness.css';
import './GoogleProfile.css';
import './GooglePosts.css';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const dateIn = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

const POSTS = [
  {
    name: 'sample-1',
    topicType: 'OFFER',
    state: 'LIVE',
    eventTitle: '20% off en desayunos',
    summary: 'De lunes a viernes, hasta las 11, todos los desayunos con 20% de descuento. Mostrá esta publicación al pedir.',
    schedule: { startDate: dateIn(-3), endDate: dateIn(11) },
    couponCode: 'DESAYUNO20',
    createTime: daysAgo(3),
  },
  {
    name: 'sample-2',
    topicType: 'STANDARD',
    state: 'LIVE',
    summary: 'Ya está la carta de otoño: budín de calabaza, chai casero y tostados de masa madre. ¡Te esperamos!',
    createTime: daysAgo(12),
  },
  {
    name: 'sample-3',
    topicType: 'EVENT',
    state: 'PROCESSING',
    eventTitle: 'Cata de cafés de origen',
    summary: 'Una tarde para probar cuatro cafés de distintos orígenes, guiada por nuestro barista. Cupos limitados.',
    schedule: { startDate: dateIn(9), endDate: dateIn(9) },
    createTime: daysAgo(1),
  },
];

const noop = () => {};

export default function GooglePostsMockup() {
  return (
    <div className="gb-page">
      <PageHeader eyebrow="Google Business" title="Publicaciones" subtitle="Publicá novedades, ofertas y eventos en tu ficha de Google" />

      <PostsToolbar options={[{ value: 'sample', label: 'Café del Parque' }]} selected="sample" onSelect={noop} />

      <div className="gb-card gbpo-composer">
        <ComposerHeader steps={stepsFor('STANDARD')} current={0} />
        <PostTypePicker value="STANDARD" onChange={noop} />
        <div className="gbpo-nav">
          <span />
          <div className="gbpo-nav__right">
            <button type="button" className="gb-btn-primary">
              Siguiente <Icon name="arrowRight" size={15} />
            </button>
          </div>
        </div>
      </div>

      <PostsList posts={POSTS} loading={false} deleting={null} onDelete={noop} />
    </div>
  );
}
