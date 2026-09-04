import './styles.css';
import { UnderwaterExperience } from './core/UnderwaterExperience';

try {
  const experience = new UnderwaterExperience();
  experience.start();
} catch (error) {
  console.error('Unable to initialize the underwater experience.', error);
  document.getElementById('loading-screen')?.setAttribute('hidden', '');
  const fatal = document.getElementById('fatal-error');
  if (fatal) fatal.hidden = false;
}
