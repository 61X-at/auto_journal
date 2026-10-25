/** FE-024: безопасные состояния карточки автомобиля на главной. */
import { validateCar } from '../models/car.js';
import { createEmptyState } from './EmptyState.js';
import { createButton } from './Button.js';

/** Читаем только переданный результат readCar(): ничего не меняем в хранилище. */
export function mountHomeCarCard(section, stored) {
  const card = section.querySelector('.car-card');
  if (!card) throw new Error('Отсутствует карточка автомобиля на главной.');

  if (!stored?.ok) {
    const empty = createEmptyState({
      title: 'Карточка автомобиля недоступна',
      description: 'Не удалось прочитать сохранённые данные. Они не удалены и не изменены.',
    });
    card.replaceChildren(empty);
    return { ok: false, status: 'unavailable' };
  }

  if (stored.data === null) {
    const empty = createEmptyState({
      title: 'Автомобиль ещё не добавлен',
      description: 'Укажите марку, модель, год и пробег в разделе «Мой авто».',
    });
    empty.append(createButton({ label: 'Добавить автомобиль', href: '#/car' }));
    card.replaceChildren(empty);
    return { ok: true, status: 'empty' };
  }

  const checked = validateCar(stored.data);
  if (!checked.ok) {
    const empty = createEmptyState({
      title: 'Данные автомобиля требуют проверки',
      description: 'Сохранённая карточка содержит ошибки. Откройте «Мой авто», проверьте поля и сохраните исправления.',
    });
    empty.append(createButton({ label: 'Проверить автомобиль', href: '#/car' }));
    card.replaceChildren(empty);
    return { ok: false, status: 'invalid' };
  }

  const car = checked.data;
  card.querySelector('h3').textContent = `${car.brand} ${car.model}`;
  card.querySelector('.car-card__subtitle').textContent = `${car.year} год · Личный автомобиль`;
  const mileage = card.querySelector('.car-properties__item dd');
  mileage.replaceChildren(document.createTextNode(`${car.currentMileage.toLocaleString('ru-RU')} `));
  const unit = document.createElement('span');
  unit.textContent = 'км';
  mileage.append(unit);
  const details = card.querySelector('.car-card__details');
  const link = document.createElement('a');
  link.href = '#/car';
  link.className = 'text-link car-card__edit';
  link.textContent = 'Изменить автомобиль';
  details.append(link);
  return { ok: true, status: 'loaded', car };
}
