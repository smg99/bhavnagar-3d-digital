import DigitalTwin from '@/components/DigitalTwin';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <DigitalTwin />
    </ErrorBoundary>
  );
}

export default App;
