import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Toolbar from './Toolbar';

describe('Toolbar', () => {
  const defaultProps = {
    activeTool: 'select' as const,
    onChangeTool: vi.fn(),
    activeColor: '#fef08a',
    onChangeColor: vi.fn(),
    activeShape: 'rect' as const,
    onChangeShape: vi.fn(),
    onClearBoard: vi.fn(),
    zoom: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    strokeWidth: 4,
    onChangeStrokeWidth: vi.fn(),
    gridMode: 'dots' as const,
    onChangeGridMode: vi.fn(),
  };

  it('renders correctly', () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByTitle('Select & Edit (V)')).toBeTruthy();
    expect(screen.getByTitle('Pan Canvas (H)')).toBeTruthy();
    expect(screen.getByTitle('Clear Board')).toBeTruthy();
  });

  it('calls onChangeTool when a tool is clicked', () => {
    const onChangeTool = vi.fn();
    render(<Toolbar {...defaultProps} onChangeTool={onChangeTool} />);
    
    const panButton = screen.getByTitle('Pan Canvas (H)');
    fireEvent.click(panButton);
    expect(onChangeTool).toHaveBeenCalledWith('pan');
  });

  it('calls onClearBoard when trash is clicked', () => {
    const onClearBoard = vi.fn();
    render(<Toolbar {...defaultProps} onClearBoard={onClearBoard} />);
    
    const clearButton = screen.getByTitle('Clear Board');
    fireEvent.click(clearButton);
    expect(onClearBoard).toHaveBeenCalled();
  });

  it('calls zoom handlers', () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onZoomReset = vi.fn();
    render(
      <Toolbar 
        {...defaultProps} 
        onZoomIn={onZoomIn} 
        onZoomOut={onZoomOut} 
        onZoomReset={onZoomReset} 
      />
    );
    
    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(onZoomIn).toHaveBeenCalled();
    
    fireEvent.click(screen.getByTitle('Zoom Out'));
    expect(onZoomOut).toHaveBeenCalled();
    
    fireEvent.click(screen.getByTitle('Reset Zoom'));
    expect(onZoomReset).toHaveBeenCalled();
  });
});
