import React from 'react'
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'

type Props = {
  visible: boolean
  title: string
  message: string
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary?: () => void
  onSecondary?: () => void
}

const EmailStatusModal: React.FC<Props> = ({
  visible,
  title,
  message,
  primaryLabel = 'Ok',
  secondaryLabel,
  onPrimary,
  onSecondary,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {secondaryLabel ? (
              <Pressable accessibilityRole="button" onPress={onSecondary} style={[styles.button, styles.secondary]}>
                <Text style={[styles.buttonText, styles.secondaryText]}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={onPrimary} style={[styles.button, styles.primary]}>
              <Text style={styles.buttonText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#374151',
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primary: {
    backgroundColor: '#7c3aed',
  },
  secondary: {
    backgroundColor: '#ede9fe',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryText: {
    color: '#4c1d95',
  },
})

export default EmailStatusModal


