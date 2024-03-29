import React, {Component} from 'react';
import {
    Animated, GestureResponderEvent, ListRenderItemInfo, PanResponder, PanResponderInstance, Vibration, View, ViewToken, LayoutAnimation,
    PanResponderGestureState, FlatList
} from 'react-native';
import {DraggableListItem} from './draggable-list-item';
import {
    IDraggableFlatListProps, IDraggableFlatListState, AnimatableListItem, ItemMeasure, ItemMeasurableRef
} from './draggable-list.models';
import {KeyboardSpacer} from './keyboard-spacer';


export class DraggableKeyboardAwareFlatList extends Component<IDraggableFlatListProps, IDraggableFlatListState> {
    private _localRefs: ItemMeasurableRef[];
    private _localRefsMeasures: ItemMeasure[];
    private _pixelToItemIndex: number[];

    private _flatListRef: any; // is a FlatList
    private _panResponder: PanResponderInstance;
    private _containerOffset: number;
    private _containerSize: number;
    private draggingAnimationRef: Animated.CompositeAnimation;
    private spacerIndex: number;
    private visibleItemIndexes: number[];

    // Initialized variables
    private _scrollOffset: number = 0;
    private _minOffset: number = 100000;
    private _maxOffset: number = -1;

    constructor(props, state) {
        super(props, state);
        this.setupPanResponder();
        this.resetItemsRefMeasuresAndPixelsToIndexes();

        this.state = {
            activeDraggingItem: null,
            activeItemMeasures: null,
            items: props.data ? props.data.map(v => new AnimatableListItem(v)) : []
        };
    }

    componentWillReceiveProps(nextProps: Readonly<IDraggableFlatListProps>, nextContext: any): void {
        if (nextProps.data) {
            this.resetItemsRefMeasuresAndPixelsToIndexes();
            this.setState({
                items: nextProps.data.map(v => new AnimatableListItem(v))
            });
        }
    }

    render() {
        if (!this.state.items) {
            return <View/>;
        }


        return <View style={{flex: 1}}>
            <View ref={ref => this.measureFlatListContainerContainer(ref)}
                  onLayout={() => {
                  }}
                  style={{position: 'relative', flex: 1}}
                  {...this._panResponder.panHandlers}>
                <FlatList {...this.props}
                          ref={ref => {
                              this._flatListRef = ref;
                          }}
                          keyboardDismissMode={"interactive"}
                          keyboardShouldPersistTaps={"handled"}
                          scrollEnabled={!this.state.activeDraggingItem}
                          data={this.state.items}
                          onScroll={({nativeEvent}) => {
                              this._scrollOffset = nativeEvent.contentOffset['y'];
                          }}
                          onViewableItemsChanged={this.handleVisibleItemsChanged}
                          keyExtractor={(it, index) => this.props.keyExtractor(it.itemRef, index)}
                          renderItem={info => this.renderItem(info)}/>
                {this.renderDraggedItem()}
            </View>
            <KeyboardSpacer onKeyboardClosed={() => {
                if (this.props.onKeyboardClosed) {
                    this.props.onKeyboardClosed();
                }
            }} onKeyboardOpened={() => {
                if (this.props.onKeyboardOpened) {
                    this.props.onKeyboardOpened();
                }
            }}/>
        </View>;
    }

    private renderItem(it: ListRenderItemInfo<AnimatableListItem>): React.ReactElement | null {
        return <DraggableListItem itemDef={it}
                                  setItemRef={(ref) => {
                                      this._localRefs[it.index] = ref;
                                  }}
                                  renderItem={item => this.props.renderItem(item)}
                                  onDragStart={(it, event) => this.handleDragStart(it, event)}/>;
    }

    private renderDraggedItem() {
        const styles = this.state.activeItemMeasures
            ? {
                width: this.state.activeItemMeasures.width,
                height: this.state.activeItemMeasures.height,
                opacity: this.state.activeDraggingItem.item.isItemDragged.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                    extrapolate: 'clamp'
                }),
                transform: [
                    {
                        scale: 0.9
                    },
                    {
                        translateY: this.state.activeDraggingItem.item.itemYPosition
                    }
                ]
            } : {};

        return !this.state.activeDraggingItem
            ? null
            : <Animated.View style={[{
                position: 'absolute'
            }, styles]}>
                {this.props.renderItem({
                    index: this.state.activeDraggingItem.index,
                    item: this.state.activeDraggingItem.item.itemRef,
                    separators: this.state.activeDraggingItem.separators,
                    dragStart: (ev) => {
                    }
                })}
            </Animated.View>;
    }

    private measureFlatListContainerContainer(ref) {
        if (ref && this._containerOffset === undefined) {
            setTimeout(() => {
                if (!ref) {
                    return;
                }
                ref.measure((x, y, width, height, pageX, pageY) => {
                    this._containerOffset = pageY;
                    this._containerSize = height;
                });
            }, 50);
        }
    };

    private async handleDragStart(it: ListRenderItemInfo<AnimatableListItem>, ev: GestureResponderEvent) {
        await this.updateMeasuresForVisibleItems();
        it.item.itemYPosition.setValue(ev.nativeEvent.pageY - this._containerOffset);

        if (this.draggingAnimationRef) {
            this.draggingAnimationRef.stop();
            this.setState({
                activeItemMeasures: null,
                activeDraggingItem: null
            });
        }

        const itemMeasures = this._localRefsMeasures[it.index];
        it.item.itemYPosition.setValue(it.index * itemMeasures.height);
        this.setState({
            activeItemMeasures: {
                ...itemMeasures
            },
            activeDraggingItem: it
        });

        this.draggingAnimationRef = Animated.timing(it.item.isItemDragged, {
            toValue: 1,
            duration: 100
        });

        Vibration.vibrate(50);
        this.draggingAnimationRef.start(() => {
            this.draggingAnimationRef = null;
        });
    }

    private handleVisibleItemsChanged = (info: { viewableItems: Array<ViewToken>; changed: Array<ViewToken> }) => {
        this.visibleItemIndexes = [];
        info.viewableItems.forEach(v => {
            if (v.isViewable) {
                this.visibleItemIndexes.push(v.index);
            }
        });
        this.updateMeasuresForVisibleItems();
    };

    private updateMeasuresForVisibleItems() {
        const refsToMeasure = [];

        for (const visibleIndex of this.visibleItemIndexes) {
            if (this._localRefs[visibleIndex] && (!this._localRefsMeasures[visibleIndex] || !this._localRefsMeasures[visibleIndex].isMeasured)) {
                refsToMeasure.push({
                    index: visibleIndex,
                    item: this._localRefs[visibleIndex]
                });
            }
        }

        if (!refsToMeasure.length) {
            return new Promise((resolve => resolve()));
        }

        return new Promise(((resolve) => {
            setTimeout(() => {
                let measuredCount = 0;

                const increaseAndCheckPromiseEnd = () => {
                    measuredCount++;
                    if (measuredCount === refsToMeasure.length) {
                        resolve();
                    }
                };
                refsToMeasure.forEach((m) => {
                    if (!m.item || (this._localRefsMeasures[m.index] && this._localRefsMeasures[m.index].isMeasured)) {
                        increaseAndCheckPromiseEnd();
                        return;
                    }

                    m.item.measure((x, y, width, height, pageX, pageY) => {
                        this._localRefsMeasures[m.index] = {
                            x, y, width, height, pageX, pageY,
                            isMeasured: (!!x || !!y || !!width || !!height || !!pageX || !!pageY)
                        };
                        this.updatePixelsToItemIndexMap(pageY, height, m.index);
                        increaseAndCheckPromiseEnd();
                    });
                });
            }, 50);
        }));
    }

    private updatePixelsToItemIndexMap(pageY, height, index) {
        const itemOffsetRelativeToFlatList = pageY + this._scrollOffset;
        const min = Math.floor(itemOffsetRelativeToFlatList);
        const max = Math.round(itemOffsetRelativeToFlatList + height);

        if (min <= this._minOffset) {
            this._minOffset = +min;
        }
        if (max >= this._maxOffset) {
            this._maxOffset = +max;
        }

        for (let i = min; i <= max; i++) {
            this._pixelToItemIndex[i] = index;
        }
        this.logPixelsArrayDetails(min, max, index);
    }

    private setupPanResponder() {
        this._panResponder = PanResponder.create({
            onStartShouldSetPanResponder: () => !!this.state.activeDraggingItem,
            onStartShouldSetPanResponderCapture: () => !!this.state.activeDraggingItem,
            onMoveShouldSetPanResponder: () => !!this.state.activeDraggingItem,
            onMoveShouldSetPanResponderCapture: () => !!this.state.activeDraggingItem,
            onPanResponderGrant: (e, g) => {
                this.state.activeDraggingItem.item.itemYPosition.setValue(this.getDraggedItemPositionRelativeToFlatList({moveY: g.moveY}));
            },
            onPanResponderMove: async (e, g) => this.handlePanResponderMove(e, g),
            onPanResponderEnd: () => this.handlePanResponderEnd()
        });
    }

    private handlePanResponderMove(e: GestureResponderEvent, g: PanResponderGestureState) {
        const {pageY} = e.nativeEvent;
        const {dy, moveY, y0} = g;

        this._flatListRef.scrollToOffset({
            offset: this._scrollOffset + (dy / 10),
            animated: false
        });

        // Update animation in the next frame
        setTimeout(() => {
            if (!this.state.activeDraggingItem) {
                return;
            }

            this.state.activeDraggingItem.item.itemYPosition.setValue(this.getDraggedItemPositionRelativeToFlatList({moveY}));
            let nextSpacerIndex = this.getHoveredComponentOffset({pageY, dy, moveY, y0});
            this.showDropSlotSpacer(moveY, y0, nextSpacerIndex);
        });
    }

    private getDraggedItemPositionRelativeToFlatList({moveY}: { moveY: number }) {
        const newGesturePosition = moveY - this._containerOffset;

        if (newGesturePosition < 0) {
            return 0;
        }

        if (newGesturePosition > this._containerOffset + this._containerSize) {
            return this._containerSize;
        }

        return newGesturePosition;
    }

    private getHoveredComponentOffset({pageY, dy, moveY, y0}: { pageY: number, dy: number, moveY: number, y0: number }) {
        const {activeItemMeasures} = this.state;

        // activeItemMeasures.pageY -> item position relative to viewport
        // activeItemMeasures.pageY + this._scrollOffset -> item position relative to Flatlist
        // moveY - y0 -> gesture dy relative to screen
        const hoveredPixelOffsetRelativeToFlatListAndDraggedElement = Math.round(activeItemMeasures.pageY + this._scrollOffset + (moveY - y0));
        const itemIndex = this._pixelToItemIndex[hoveredPixelOffsetRelativeToFlatListAndDraggedElement];

        const minItemIndex = 0;
        const maxItemIndex = this.props.data.length - 1;

        if (itemIndex || itemIndex === 0) {
            this.logHoveredComponent(hoveredPixelOffsetRelativeToFlatListAndDraggedElement, itemIndex);
            return itemIndex;
        }

        if (pageY < this._minOffset) {
            this.logHoveredComponent(hoveredPixelOffsetRelativeToFlatListAndDraggedElement, minItemIndex);
            return minItemIndex;
        }

        if (pageY > this._maxOffset) {
            this.logHoveredComponent(hoveredPixelOffsetRelativeToFlatListAndDraggedElement, maxItemIndex);
            return maxItemIndex;
        }

        if (dy > 0 && hoveredPixelOffsetRelativeToFlatListAndDraggedElement < this._maxOffset) {
            let cursor = hoveredPixelOffsetRelativeToFlatListAndDraggedElement;
            while (!this._pixelToItemIndex[cursor] && cursor < this._maxOffset) {
                cursor++;
            }

            const minToReturn = this._pixelToItemIndex[cursor] || minItemIndex;
            this.logHoveredComponent(cursor, minToReturn);
            return minToReturn;
        }

        if (dy < 0 && hoveredPixelOffsetRelativeToFlatListAndDraggedElement > this._minOffset) {
            let cursor = hoveredPixelOffsetRelativeToFlatListAndDraggedElement;
            while (!this._pixelToItemIndex[cursor] && cursor > this._minOffset) {
                cursor--;
            }

            const maxToReturn = this._pixelToItemIndex[cursor] || maxItemIndex;
            this.logHoveredComponent(cursor, maxToReturn);
            return maxToReturn;
        }

        const fallbackValue = dy < 0 ? minItemIndex : maxItemIndex;
        this.logHoveredComponent(hoveredPixelOffsetRelativeToFlatListAndDraggedElement, fallbackValue);
        return fallbackValue;
    }

    private showDropSlotSpacer(moveY: number, y0: number, nextSpacerIndex: number) {
        if (this.spacerIndex === nextSpacerIndex) {
            return;
        }

        if (this.state.items[this.spacerIndex]) {
            this.state.items[this.spacerIndex].isItemHoveredTop.setValue(0);
            this.state.items[this.spacerIndex].isItemHoveredBottom.setValue(0);
            this.state.items[this.spacerIndex].hoverTopActive = false;
            this.state.items[this.spacerIndex].hoverBottomActive = false;
        }

        if (nextSpacerIndex === this.state.activeDraggingItem.index) {
            return;
        }

        const showTopOrBottomSpacer = this.getGestureDyRelativeToFlatList(moveY, y0);
        if (showTopOrBottomSpacer < 0) {
            if (nextSpacerIndex !== null && nextSpacerIndex !== undefined && this.state.items[nextSpacerIndex]) {
                this.state.items[nextSpacerIndex].isItemHoveredTop.setValue(1);
                this.state.items[nextSpacerIndex].hoverTopActive = true;
                this.spacerIndex = nextSpacerIndex;
            }

            return;
        }

        if (nextSpacerIndex !== null && nextSpacerIndex !== undefined) {
            this.state.items[nextSpacerIndex].isItemHoveredBottom.setValue(1);
            this.state.items[nextSpacerIndex].hoverBottomActive = true;
            this.spacerIndex = nextSpacerIndex;
        }
    }

    private getGestureDyRelativeToFlatList(moveY: number, y0: number) {
        // y0 -> gesture start position
        // moveY -> gesture current move
        // moveY - y0 -> gesture dy difference
        // moveY - y0 + this._scrollOffset -> gesture dy difference relative to list scroll offset
        return moveY - y0 + this._scrollOffset;
    }

    private handlePanResponderEnd() {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (this.spacerIndex === this.state.activeDraggingItem.index) {
            this.state.activeDraggingItem.item.isItemDragged.setValue(0);
            if (this.state.items[this.spacerIndex]) {
                this.state.items[this.spacerIndex].isItemHoveredTop.setValue(0);
                this.state.items[this.spacerIndex].isItemHoveredBottom.setValue(0);
            }
            this.setState({
                activeItemMeasures: null,
                activeDraggingItem: null
            });
            return;
        }

        if (!this.state.items[this.spacerIndex]) {
            return;;
        }

        const itemRef = this.state.items[this.spacerIndex];
        const newItemsList = this.state.items.filter(v => v !== this.state.activeDraggingItem.item);
        const newSpacerIndex = newItemsList.indexOf(itemRef);
        newItemsList.splice(
            newSpacerIndex > this.state.activeDraggingItem.index ? newSpacerIndex + 1 : newSpacerIndex,
            0,
            this.state.activeDraggingItem.item);

        this.state.activeDraggingItem.item.isItemDragged.setValue(0);
        this.state.items[this.spacerIndex].isItemHoveredTop.setValue(0);
        this.state.items[this.spacerIndex].isItemHoveredBottom.setValue(0);
        this.setState({
            activeItemMeasures: null,
            activeDraggingItem: null,
            items: newItemsList
        });
        setTimeout(() => {
            this.props.onItemsDropped(newItemsList.map(v => v.itemRef));
        });
    }

    private resetItemsRefMeasuresAndPixelsToIndexes() {
        this._localRefs = [];
        this._localRefsMeasures = [];
        this._pixelToItemIndex = [];
    }

    private logPixelsArrayDetails(min, max, index) {
        // console.log('min', min, '->', 'max', max, index);
    }

    private logHoveredComponent(componentPixel, indexValue) {
        // console.log('pixel -> ', componentPixel, 'index -> ', indexValue);
    }
}
