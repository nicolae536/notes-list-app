import {loggerInstance} from '../../components/logger';
import {NoteItem} from '../../domain/note-item';
import {NotesList} from '../../domain/notes-list';
import {stateContainer} from '../../domain/state-container';

export const notesListDetailsUpdate = {
    activateOrCreateItem: (uuid: string) => stateContainer.pureStateUpdate(appState => {
        return appState.update({
            activeNotesList: appState.notesItems.find(n => n.uuid === uuid) || new NotesList()
        });
    }),
    updateTitle: (newTitle) => stateContainer.pureStateUpdate(appState => {
        loggerInstance.log('features.NotesListDetailsUpdaters', 'title-update');
        appState.activeNotesList!.title = newTitle;
        return appState;
    }),
    updateNoteItemDescription: (description: string) => stateContainer.pureStateUpdate(appState => {
        if (description.length > 1) {
            const lastItemIndex = appState.activeNotesList!.noteItems.length - 1;

            if (!appState.activeNotesList!.noteItems[lastItemIndex].isEmpty()) {
                appState.activeNotesList!.noteItems.push(new NoteItem());
            }
        }

        appState.activeNoteItem!.description = description;
        return appState;
    }),
    updateNoteItemIsDone: (it: NoteItem, isDone: boolean) => stateContainer.pureStateUpdate(appState => {
        if (!it.description) {
            return appState.swallowClone();
        }

        it!.isDone = isDone;
        const newNoteItems: NoteItem[] = [];
        const newDoneNoteItems: NoteItem[] = [];
        appState.activeNotesList!.noteItems.forEach(ite => {
            if (ite.isDone) {
                newDoneNoteItems.push(ite);
            } else {
                newNoteItems.push(ite);
            }
        });
        appState.activeNotesList!.doneNoteItems.forEach(ite => {
            if (ite.isDone) {
                newDoneNoteItems.push(ite);
            } else {
                newNoteItems.push(ite);
            }
        });
        appState.activeNotesList!.doneNoteItems = newDoneNoteItems;
        appState.activeNotesList!.noteItems = newNoteItems.sort(NoteItem.noteItemsCompare);
        return appState;
    }),
    removeItem: (it: NoteItem) => stateContainer.pureStateUpdate(appState => {
        if (it.isDone) {
            appState.activeNotesList!.doneNoteItems = appState.activeNotesList!.doneNoteItems.filter(v => v.uuid !== it.uuid);
        } else {
            appState.activeNotesList!.noteItems = appState.activeNotesList!.noteItems.filter(v => v.uuid !== it.uuid);
        }
        return appState;
    }),
    cleanState: () => stateContainer.pureStateUpdate(appState => {
        let wasUpdated = false;

        const newNotesItems = appState.notesItems.map((v, index) => {
            if (v.uuid === appState.activeNotesList!.uuid) {
                appState.notesItems[index] = appState.activeNotesList!;
                wasUpdated = true;
                return appState.activeNotesList!.swallowClone();
            }

            return v;
        });

        if (!wasUpdated && !appState.activeNotesList!.isEmpty()) {
            newNotesItems.push(appState.activeNotesList!);
            wasUpdated = true;
        }

        loggerInstance.log('features.NotesListDetailsUpdaters', wasUpdated);

        return appState.update({
            activeNoteItem: null,
            activeNotesList: null,
            notesItems: newNotesItems
        });
    }),
    setActiveNodeItem: (it: NoteItem) => stateContainer.pureStateUpdate(appState => {
        const lastItemIndex = appState.activeNotesList!.noteItems.length - 1;

        if (!appState.activeNotesList!.noteItems[lastItemIndex].isEmpty() && !it.isEmpty()) {
            appState.activeNotesList!.noteItems.push(new NoteItem());
        }

        return appState.update({
            activeNoteItem: it
        });
    })
};