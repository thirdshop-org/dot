package models

import "fmt"

const SERVER_VERSION = 1

type Client interface {
	GetClientVersion() int
}

func NewClient(clientVersion int) (Client, error) {

	isCompatible := ServerClientIsCompatibleWithClient(clientVersion)

	if !isCompatible {
		return nil, fmt.Errorf("client version %d is not compatible with the server version %d", clientVersion, SERVER_VERSION)
	}

	client := ClientVerisonOne{
		Version: clientVersion,
	}

	return &client, nil

}

func ServerClientIsCompatibleWithClient(clientVersion int) bool {

	switch clientVersion {
	case 1:

		serverCompatibleVersion := []int{1}

		for _, serverVersion := range serverCompatibleVersion {
			if serverVersion == clientVersion {
				return true
			}
		}

		return false
	default:
		return false
	}

}

type ClientVerisonOne struct {
	Version int
}

func (c *ClientVerisonOne) GetClientVersion() int {
	return c.Version
}
