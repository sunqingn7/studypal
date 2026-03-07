import { Group, Panel, Separator } from 'react-resizable-panels'
import FileView from '../components/views/file-view/FileView'
import NoteView from '../components/views/note-view/NoteView'
import AIView from '../components/views/ai-view/AIView'

function MainLayout() {
  return (
    <div className="app-container">
      <Group orientation="horizontal">
        <Panel id="file" defaultSize={60} minSize={30}>
          <FileView />
        </Panel>
        <Separator />
        <Panel id="right" defaultSize={40} minSize={20}>
          <Group orientation="vertical">
            <Panel id="ai" defaultSize={50} minSize={20}>
              <AIView />
            </Panel>
            <Separator />
            <Panel id="note" defaultSize={50} minSize={20}>
              <NoteView />
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  )
}

export default MainLayout
