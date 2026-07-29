import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

export interface ConfirmOption {
  label: string;
  onPress?: () => void;
  destructive?: boolean;
}

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  options: ConfirmOption[];
  onClose: () => void;
}

export function ConfirmModal({ visible, title, message, options, onClose }: ConfirmModalProps) {
  const stacked = options.length > 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={[styles.optionsContainer, stacked && styles.optionsStacked]}>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  stacked ? styles.stackedBtn : styles.sideBtn,
                  opt.destructive && (stacked ? styles.stackedDestructive : styles.sideDestructive),
                  !opt.destructive && !stacked && styles.sideBtnSecondary,
                  !opt.destructive && stacked && styles.stackedSecondary,
                  i < options.length - 1 && stacked && styles.stackedBtnBorder,
                ]}
                onPress={() => {
                  onClose();
                  opt.onPress?.();
                }}
              >
                <Text
                  style={[
                    stacked ? styles.stackedBtnText : styles.sideBtnText,
                    opt.destructive && (stacked ? styles.stackedDestructiveText : styles.sideDestructiveText),
                    !opt.destructive && !stacked && styles.sideBtnSecondaryText,
                    !opt.destructive && stacked && styles.stackedSecondaryText,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    width: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  optionsStacked: {
    flexDirection: 'column',
    gap: 0,
  },
  sideBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  sideDestructive: {
    backgroundColor: '#E53935',
  },
  sideBtnSecondary: {
    backgroundColor: '#f5f5f5',
  },
  sideBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sideDestructiveText: {
    color: '#fff',
  },
  sideBtnSecondaryText: {
    color: '#666',
  },
  stackedBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  stackedBtnBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stackedDestructive: {},
  stackedSecondary: {},
  stackedBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  stackedDestructiveText: {
    color: '#E53935',
  },
  stackedSecondaryText: {
    color: '#333',
  },
});
