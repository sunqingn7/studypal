import { ViewPlugin, PluginMetadata, PluginContext } from '../../domain/models/plugin';
import { ClassroomView } from '../../presentation/components/views/classroom-view';
import { useClassroomStore } from '../../application/store/classroom-store';

export class ClassroomViewPlugin implements ViewPlugin {
  metadata: PluginMetadata = {
    id: 'view-classroom',
    name: 'Classroom View',
    type: 'view',
    version: '1.0.0',
    description: 'Classroom mode with PPT, document, chat, and notes views',
    author: 'StudyPal Team',
  };

  type: 'view' = 'view';

  async initialize(): Promise<void> {
  }

  async destroy(): Promise<void> {
  }

  getViewComponent() {
    return ClassroomView;
  }

  canHandle(context: PluginContext): boolean {
    const store = useClassroomStore.getState();
    return store.isActive && context.viewMode === 'classroom';
  }

  getViewName(): string {
    return 'Classroom';
  }

  getViewIcon?(): string {
    return '🎓';
  }
}

export const classroomViewPlugin = new ClassroomViewPlugin();
