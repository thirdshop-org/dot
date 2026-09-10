package entities

import "fmt"

const SERVER_VERSION = 1

type Client interface {
	GetClientVersion() int
}

func NewClient(clientVersion int) (error, Client) {

	isCompatible := ServerClientIsCompatibleWithClient(clientVersion)

	if !isCompatible {
		return fmt.Errorf("You client version %n is not compatible with the server verison %n", clientVersion, SERVER_VERSION), nil
	}

	client := ClientVerisonOne{
		Version: clientVersion,
	}

	return nil, &client

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
